// ===== Web Audio API 音频引擎（单例） =====
// 管理 HTMLAudioElement + AudioContext + 10 段 EQ 链 + 主音量 + 可视化分析
// 音频图: MediaElementSource → 10×BiquadFilter → GainNode → AnalyserNode → destination

/** EQ 各段中心频率（Hz） */
export const EQ_FREQUENCIES = [
  60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000,
];

/** EQ 频率标签（用于 UI 显示） */
export const EQ_LABELS = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'];

export class AudioEngine {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private gainNode: GainNode | null = null;
  private normalizationGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserErrorLogged = false;

  private _volume = 0.8;
  private _eqGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private _loudnessBalanceEnabled = true;
  private loudnessSamples = 0;
  private loudnessMean = 0;
  private recentEnergy = 0;
  private crossfading = false;
  private transitionAudio: HTMLAudioElement | null = null;
  private crossfadeGeneration = 0;
  private loudnessCalibrationElapsed = 0;
  private lastCalibrationPosition = 0;

  // 内部回调
  private _timeUpdateCb: ((time: number) => void) | null = null;
  private _endedCb: (() => void) | null = null;
  private _loadedCb: ((duration: number) => void) | null = null;
  private _playStateCb: ((playing: boolean) => void) | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';

    this.bindAudioEvents(this.audio);
  }

  private bindAudioEvents(audio: HTMLAudioElement): void {
    audio.addEventListener('timeupdate', () => {
      if (audio !== this.audio || this.crossfading) return;
      this._timeUpdateCb?.(this.audio.currentTime);
      const delta = this.audio.currentTime - this.lastCalibrationPosition;
      if (delta > 0 && delta <= 2.5) this.loudnessCalibrationElapsed += delta;
      this.lastCalibrationPosition = this.audio.currentTime;
      this.sampleLoudness();
    });
    audio.addEventListener('ended', () => {
      if (audio !== this.audio || this.crossfading) return;
      this._endedCb?.();
    });
    audio.addEventListener('loadedmetadata', () => {
      if (audio !== this.audio) return;
      this._loadedCb?.(this.audio.duration);
    });
    audio.addEventListener('play', () => {
      if (audio !== this.audio) return;
      this._playStateCb?.(true);
    });
    audio.addEventListener('pause', () => {
      if (audio !== this.audio || this.crossfading) return;
      this._playStateCb?.(false);
    });
  }

  /** 懒创建 AudioContext 与音频图（浏览器要求用户手势触发） */
  private ensureContext(): void {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaElementSource(this.audio);

    // 创建 10 段 EQ 滤波器链
    this.filters = EQ_FREQUENCIES.map((freq, i) => {
      const filter = this.ctx!.createBiquadFilter();
      if (i === 0) {
        filter.type = 'lowshelf';
      } else if (i === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.4;
      }
      filter.frequency.value = freq;
      filter.gain.value = this._eqGains[i];
      return filter;
    });

    // 主音量节点
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this._volume;
    this.normalizationGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = this._loudnessBalanceEnabled ? 2 : 1;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.35;

    // 连接音频图: source → filter[0] → … → filter[9] → gain → destination
    this.source.connect(this.filters[0]);
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
    this.filters[this.filters.length - 1].connect(this.normalizationGain);
    this.normalizationGain.connect(this.compressor);
    try {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
    } catch (error) {
      this.analyser = null;
      this.compressor.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      if (!this.analyserErrorLogged) {
        this.analyserErrorLogged = true;
        console.warn('音频可视化不可用，播放将继续:', error);
      }
    }
  }

  /** 将当前频谱写入调用方复用的缓冲区。音频上下文未就绪时返回 false。 */
  getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || target.length !== this.analyser.frequencyBinCount) return false;
    this.analyser.getByteFrequencyData(target);
    const instantEnergy = target.reduce((sum, value) => sum + value, 0) / (target.length * 255);
    this.recentEnergy += (instantEnergy - this.recentEnergy) * 0.08;
    this.updateLoudnessEstimate(instantEnergy);
    return true;
  }

  private sampleLoudness(): void {
    if (!this.analyser || !this.ctx) return;
    const data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.analyser.getByteFrequencyData(data);
    const mean = data.reduce((sum, value) => sum + value, 0) / (data.length * 255);
    this.recentEnergy += (mean - this.recentEnergy) * 0.08;
    this.updateLoudnessEstimate(mean);
  }

  private updateLoudnessEstimate(mean: number): void {
    if (!this._loudnessBalanceEnabled || !this.normalizationGain || !this.ctx || this.loudnessCalibrationElapsed >= 15) return;
    this.loudnessSamples += 1;
    this.loudnessMean += (mean - this.loudnessMean) / this.loudnessSamples;
    const desired = Math.min(1.3, Math.max(0.75, 0.24 / Math.max(0.08, this.loudnessMean)));
    this.normalizationGain.gain.setTargetAtTime(desired, this.ctx.currentTime, 3.5);
  }

  /** 可视化所需的频谱缓冲区长度。首次播放前使用 FFT 默认值。 */
  get frequencyBinCount(): number {
    return this.analyser?.frequencyBinCount ?? 128;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44_100;
  }

  get analyserFftSize(): number {
    return this.analyser?.fftSize ?? 256;
  }

  get analysisState(): 'pending' | 'ready' | 'unavailable' {
    if (!this.ctx) return 'pending';
    return this.analyser ? 'ready' : 'unavailable';
  }

  // ===== 回调注册 =====

  /** 注册时间更新回调 */
  onTimeUpdate(cb: (time: number) => void): void {
    this._timeUpdateCb = cb;
  }

  /** 注册播放结束回调 */
  onEnded(cb: () => void): void {
    this._endedCb = cb;
  }

  /** 注册元数据加载回调（获取时长） */
  onLoadedMetadata(cb: (duration: number) => void): void {
    this._loadedCb = cb;
  }

  /** 注册播放状态变更回调 */
  onPlayStateChange(cb: (playing: boolean) => void): void {
    this._playStateCb = cb;
  }

  // ===== 播放控制 =====

  /** 加载音频 URL */
  load(url: string): void {
    this.cancelCrossfade();
    this.ensureContext();
    this.audio.src = url;
    this.audio.load();
    this.loudnessSamples = 0;
    this.loudnessMean = 0;
    this.loudnessCalibrationElapsed = 0;
    this.lastCalibrationPosition = 0;
    if (this.ctx) this.normalizationGain?.gain.setValueAtTime(1, this.ctx.currentTime);
  }

  async crossfadeTo(url: string, seconds: number): Promise<boolean> {
    this.ensureContext();
    if (!this.ctx || this.audio.paused || this.crossfading) return false;
    this.crossfading = true;
    const generation = ++this.crossfadeGeneration;
    const previous = this.audio;
    const previousSource = this.source;
    const next = new Audio();
    next.crossOrigin = 'anonymous';
    next.volume = 0;
    this.transitionAudio = next;
    this.bindAudioEvents(next);
    let nextSource: MediaElementAudioSourceNode | null = null;
    try {
      nextSource = this.ctx.createMediaElementSource(next);
      nextSource.connect(this.filters[0]);
      next.src = url;
      next.load();
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('crossfade preload timeout')), 4000);
        next.addEventListener('canplay', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
        next.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('crossfade preload failed')); }, { once: true });
      });
      if (generation !== this.crossfadeGeneration) throw new Error('crossfade cancelled');
      await next.play();
    } catch {
      next.pause();
      nextSource?.disconnect();
      this.releaseCrossfade(generation, next);
      return false;
    }

    const durationMs = Math.max(0.2, seconds) * 1000;
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        document.removeEventListener('visibilitychange', onHidden);
        resolve();
      };
      const onHidden = () => {
        if (!document.hidden) return;
        previous.volume = 0;
        next.volume = 1;
        finish();
      };
      const ramp = (now: number) => {
        if (generation !== this.crossfadeGeneration) {
          finish();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / durationMs);
        previous.volume = Math.cos(progress * Math.PI * 0.5);
        next.volume = Math.sin(progress * Math.PI * 0.5);
        if (progress < 1) requestAnimationFrame(ramp);
        else finish();
      };
      document.addEventListener('visibilitychange', onHidden);
      if (document.hidden) {
        previous.volume = 0;
        next.volume = 1;
        finish();
      } else {
        requestAnimationFrame(ramp);
      }
    });

    if (generation !== this.crossfadeGeneration) {
      next.pause();
      nextSource?.disconnect();
      return false;
    }

    previous.pause();
    previous.removeAttribute('src');
    previousSource?.disconnect();
    this.audio = next;
    this.source = nextSource;
    next.volume = 1;
    this.crossfading = false;
    this.transitionAudio = null;
    this.loudnessSamples = 0;
    this.loudnessMean = 0;
    this.loudnessCalibrationElapsed = 0;
    this.lastCalibrationPosition = 0;
    if (this.ctx) this.normalizationGain?.gain.setValueAtTime(1, this.ctx.currentTime);
    this._loadedCb?.(next.duration);
    this._playStateCb?.(true);
    return true;
  }

  get tailEnergy(): number {
    return this.recentEnergy;
  }

  /** 播放（恢复或从头开始） */
  play(): void {
    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.audio.play().catch((err) => {
      console.error('播放失败:', err);
    });
  }

  /** 暂停 */
  pause(): void {
    this.audio.pause();
    this.cancelCrossfade();
  }

  cancelCrossfade(): void {
    if (!this.crossfading && !this.transitionAudio) return;
    this.crossfadeGeneration += 1;
    this.crossfading = false;
    this.transitionAudio?.pause();
    this.transitionAudio = null;
    this.audio.volume = 1;
  }

  /** Clear transition state only when the caller still owns it. */
  private releaseCrossfade(generation: number, audio: HTMLAudioElement): boolean {
    if (generation !== this.crossfadeGeneration || this.transitionAudio !== audio) return false;
    this.crossfading = false;
    this.transitionAudio = null;
    return true;
  }

  /** 跳转到指定时间（秒） */
  seek(time: number): boolean {
    if (!isFinite(this.audio.duration)) return false;
    this.audio.currentTime = time;
    return true;
  }

  // ===== 音量 =====

  /** 设置主音量（0 ~ 1） */
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }

  setLoudnessBalance(enabled: boolean): void {
    this._loudnessBalanceEnabled = enabled;
    if (this.ctx) {
      this.normalizationGain?.gain.setTargetAtTime(1, this.ctx.currentTime, 0.8);
      this.compressor?.ratio.setValueAtTime(enabled ? 2 : 1, this.ctx.currentTime);
    }
    this.loudnessSamples = 0;
    this.loudnessMean = 0;
    this.loudnessCalibrationElapsed = 0;
    this.lastCalibrationPosition = this.audio.currentTime;
  }

  // ===== EQ 控制 =====

  /** 设置 EQ 某段增益（dB，范围 ±12） */
  setEqBand(index: number, gainDb: number): void {
    if (index < 0 || index >= 10) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));
    this._eqGains[index] = clamped;
    if (this.filters[index]) {
      this.filters[index].gain.value = clamped;
    }
  }

  /** 批量设置 EQ 增益 */
  setEqGains(gains: number[]): void {
    this._eqGains = gains.map((g) => Math.max(-12, Math.min(12, g)));
    this._eqGains.forEach((g, i) => {
      if (this.filters[i]) {
        this.filters[i].gain.value = g;
      }
    });
  }

  /** 获取当前 EQ 增益数组 */
  getEqGains(): number[] {
    return [...this._eqGains];
  }

  // ===== 只读属性 =====

  /** 获取当前播放时间 */
  get currentTime(): number {
    return this.audio.currentTime;
  }

  /** 获取总时长 */
  get duration(): number {
    return this.audio.duration;
  }
}

/** 单例导出 */
export const audioEngine = new AudioEngine();
