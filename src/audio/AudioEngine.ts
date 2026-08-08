// ===== Web Audio API 音频引擎（单例） =====
// 管理 HTMLAudioElement + AudioContext + 10 段 EQ 链 + 主音量
// 音频图: MediaElementSource → 10×BiquadFilter → GainNode(主音量) → destination

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

  private _volume = 0.8;
  private _eqGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  // 内部回调
  private _timeUpdateCb: ((time: number) => void) | null = null;
  private _endedCb: (() => void) | null = null;
  private _loadedCb: ((duration: number) => void) | null = null;
  private _playStateCb: ((playing: boolean) => void) | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';

    this.audio.addEventListener('timeupdate', () => {
      this._timeUpdateCb?.(this.audio.currentTime);
    });
    this.audio.addEventListener('ended', () => {
      this._endedCb?.();
    });
    this.audio.addEventListener('loadedmetadata', () => {
      this._loadedCb?.(this.audio.duration);
    });
    this.audio.addEventListener('play', () => {
      this._playStateCb?.(true);
    });
    this.audio.addEventListener('pause', () => {
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

    // 连接音频图: source → filter[0] → … → filter[9] → gain → destination
    this.source.connect(this.filters[0]);
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
    this.filters[this.filters.length - 1].connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
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
    this.ensureContext();
    this.audio.src = url;
    this.audio.load();
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
  }

  /** 跳转到指定时间（秒） */
  seek(time: number): void {
    if (isFinite(this.audio.duration)) {
      this.audio.currentTime = time;
    }
  }

  // ===== 音量 =====

  /** 设置主音量（0 ~ 1） */
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
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
