// ===== 均衡器面板（浮层面板） =====
import { useEffect, useState } from 'react';
import { audioEngine, EQ_LABELS } from '../audio/AudioEngine';
import { api } from '../lib/api';
import type { EqPreset } from '../lib/api';
import { useStore } from '../store/useStore';

/** 内置预设定义 */
const BUILTIN_PRESETS: Record<string, number[]> = {
  'Flat':         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost':   [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 2, 4, 5, 6, 6],
  'Vocal':        [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  'Rock':         [5, 4, 2, -1, -2, 0, 2, 3, 4, 4],
  'Pop':          [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  'Classical':    [4, 3, 2, 0, 0, 0, -2, -2, -1, -1],
  'Acoustic':     [3, 2, 1, 0, 2, 2, 3, 3, 2, 1],
};

export default function EqPanel() {
  const crossfadeEnabled = useStore((s) => s.crossfadeEnabled);
  const loudnessBalanceEnabled = useStore((s) => s.loudnessBalanceEnabled);
  const setCrossfadeEnabled = useStore((s) => s.setCrossfadeEnabled);
  const setLoudnessBalanceEnabled = useStore((s) => s.setLoudnessBalanceEnabled);
  const [gains, setGains] = useState<number[]>(audioEngine.getEqGains());
  const [presets, setPresets] = useState<EqPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savingName, setSavingName] = useState('');

  // 加载后端预设列表
  useEffect(() => {
    api.eq.listPresets().then(setPresets).catch((e) => console.error('加载 EQ 预设失败:', e));
  }, []);

  // 设置单个频段增益
  const handleSliderChange = (index: number, value: number) => {
    const newGains = [...gains];
    newGains[index] = value;
    setGains(newGains);
    audioEngine.setEqBand(index, value);
    setSelectedPreset('');
  };

  // 应用预设
  const handleApplyPreset = (name: string) => {
    setSelectedPreset(name);
    // 先查内置预设，再查后端预设
    if (BUILTIN_PRESETS[name]) {
      const presetGains = BUILTIN_PRESETS[name];
      setGains([...presetGains]);
      audioEngine.setEqGains(presetGains);
      return;
    }
    const preset = presets.find((p) => p.name === name);
    if (preset) {
      setGains([...preset.gains]);
      audioEngine.setEqGains(preset.gains);
    }
  };

  // 重置
  const handleReset = () => {
    const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    setGains([...flat]);
    audioEngine.setEqGains(flat);
    setSelectedPreset('Flat');
  };

  // 另存为预设
  const handleSavePreset = async () => {
    if (!savingName.trim()) return;
    try {
      const preset: EqPreset = {
        name: savingName.trim(),
        gains: [...gains],
        builtin: false,
      };
      await api.eq.savePreset(preset);
      const updated = await api.eq.listPresets();
      setPresets(updated);
      setSelectedPreset(savingName.trim());
      setShowSaveInput(false);
      setSavingName('');
    } catch (e) {
      console.error('保存预设失败:', e);
    }
  };

  return (
    <div className="eq-panel glass-panel">
      {/* 标题 */}
      <div className="eq-header">
        <span className="eq-title">均衡器</span>
      </div>

      <div className="listening-settings" aria-label="连续聆听设置">
        <label className="listening-setting">
          <span><strong>Crossfade</strong><small>曲目衔接时自动柔和重叠，可随时关闭</small></span>
          <input type="checkbox" checked={crossfadeEnabled} onChange={(e) => setCrossfadeEnabled(e.target.checked)} />
        </label>
        <label className="listening-setting">
          <span><strong>响度平衡</strong><small>缓慢拉近歌曲响度，不压扁动态</small></span>
          <input type="checkbox" checked={loudnessBalanceEnabled} onChange={(e) => setLoudnessBalanceEnabled(e.target.checked)} />
        </label>
      </div>

      {/* 预设选择 + 另存为 */}
      <div className="eq-presets">
        <select
          className="eq-preset-select"
          value={selectedPreset}
          onChange={(e) => handleApplyPreset(e.target.value)}
        >
          <option value="" disabled>选择预设…</option>
          <optgroup label="内置">
            {Object.keys(BUILTIN_PRESETS).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
          {presets.length > 0 && (
            <optgroup label="自定义">
              {presets.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>

        {showSaveInput ? (
          <div className="eq-save-row">
            <input
              type="text"
              className="eq-save-input"
              placeholder="预设名称"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              autoFocus
            />
            <button className="primary" onClick={handleSavePreset}>保存</button>
            <button onClick={() => setShowSaveInput(false)}>取消</button>
          </div>
        ) : (
          <>
            <button onClick={() => setShowSaveInput(true)}>另存为</button>
            <button onClick={handleReset}>重置</button>
          </>
        )}
      </div>

      {/* 10 段垂直滑块 */}
      <div className="eq-sliders">
        {EQ_LABELS.map((label, i) => (
          <div key={i} className="eq-slider">
            <div className="eq-slider-value">
              {gains[i] > 0 ? '+' : ''}{gains[i].toFixed(1)}
            </div>
            <div className="eq-slider-track">
              <input
                type="range"
                className="eq-slider-input"
                min={-12}
                max={12}
                step={0.5}
                value={gains[i]}
                onChange={(e) => handleSliderChange(i, parseFloat(e.target.value))}
              />
            </div>
            <div className="eq-slider-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
