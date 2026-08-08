// ===== 批量标签编辑面板（模态对话框） =====
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import type { BatchTagResult, BatchTagUpdate, TrackTags } from '../lib/api';

interface BatchTagEditorProps {
  onClose: () => void;
  onUpdated: () => void;
}

/** 字段定义 */
const FIELD_DEFS: { key: keyof BatchTagUpdate['fields']; label: string; type: 'text' | 'number' }[] = [
  { key: 'title', label: '标题', type: 'text' },
  { key: 'artist', label: '艺术家', type: 'text' },
  { key: 'album', label: '专辑', type: 'text' },
  { key: 'albumArtist', label: '专辑艺术家', type: 'text' },
  { key: 'genre', label: '流派', type: 'text' },
  { key: 'year', label: '年份', type: 'number' },
  { key: 'trackNo', label: '曲目号', type: 'number' },
  { key: 'discNo', label: '碟号', type: 'number' },
];

export default function BatchTagEditor({ onClose, onUpdated }: BatchTagEditorProps) {
  const selectedTrackIds = useStore((s) => s.selectedTrackIds);
  const clearSelection = useStore((s) => s.clearSelection);

  const [values, setValues] = useState<Record<string, string>>({});
  const [enabledFields, setEnabledFields] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'overwrite' | 'fillEmpty'>('overwrite');
  const [result, setResult] = useState<BatchTagResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 歌词和封面状态
  const [lyricsEnabled, setLyricsEnabled] = useState(false);
  const [lyricsValue, setLyricsValue] = useState('');
  const [coverEnabled, setCoverEnabled] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverData, setCoverData] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);

  // 打开编辑器时，加载第一首选中曲目的现有标签作为预填充
  useEffect(() => {
    const firstId = [...selectedTrackIds][0];
    if (!firstId) {
      setLoading(false);
      return;
    }
    api.library.getTrackTags(firstId)
      .then((tags: TrackTags) => {
        // 预填充字段值（不自动勾选）
        const vals: Record<string, string> = {};
        if (tags.title) vals['title'] = tags.title;
        if (tags.artist) vals['artist'] = tags.artist;
        if (tags.album) vals['album'] = tags.album;
        if (tags.album_artist) vals['albumArtist'] = tags.album_artist;
        if (tags.genre) vals['genre'] = tags.genre;
        if (tags.year) vals['year'] = String(tags.year);
        if (tags.track_no) vals['trackNo'] = String(tags.track_no);
        if (tags.disc_no) vals['discNo'] = String(tags.disc_no);
        setValues(vals);

        // 预填充歌词
        if (tags.lyrics) {
          setLyricsValue(tags.lyrics);
        }

        // 预填充封面
        if (tags.cover_art) {
          setCoverPreview(tags.cover_art);
          setCoverData(tags.cover_art);
        }
      })
      .catch((e) => console.error('加载标签失败:', e))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 切换字段启用状态
  const toggleField = (key: string) => {
    setEnabledFields((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  // 封面图片选择
  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件 (JPEG/PNG/WebP)');
      return;
    }

    // 验证文件大小 (< 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('图片文件过大，请选择小于 10MB 的图片');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCoverData(dataUrl);
      setCoverPreview(dataUrl);
      setCoverEnabled(true); // 自动启用
    };
    reader.readAsDataURL(file);
  };

  // 清除封面
  const handleClearCover = () => {
    setCoverData('');
    setCoverPreview(null);
    setCoverEnabled(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 提交写入
  const handleSubmit = async () => {
    const hasTextFields = enabledFields.size > 0 || lyricsEnabled;
    const hasCover = coverEnabled && coverData.length > 0;
    if (!hasTextFields && !hasCover) return;

    // 构建字段对象
    const fields: Record<string, unknown> = {};

    // 文本字段
    for (const def of FIELD_DEFS) {
      if (!enabledFields.has(def.key)) continue;
      const val = values[def.key] ?? '';
      if (def.type === 'number') {
        const num = parseInt(val, 10);
        if (!isNaN(num)) fields[def.key] = num;
      } else if (val.trim()) {
        fields[def.key] = val.trim();
      }
    }

    // 歌词字段
    if (lyricsEnabled && lyricsValue.trim()) {
      fields['lyrics'] = lyricsValue.trim();
    }

    // 封面字段
    if (coverEnabled && coverData) {
      fields['coverArt'] = coverData;
    }

    if (Object.keys(fields).length === 0) return;

    setSubmitting(true);
    try {
      const res = await api.tag.batchUpdate({
        trackIds: [...selectedTrackIds],
        fields,
        mode,
      });
      setResult(res);
      if (res.failed === 0) {
        onUpdated();
      }
    } catch (e) {
      console.error('批量更新失败:', e);
      setResult({
        updated: 0,
        failed: selectedTrackIds.size,
        errors: [...selectedTrackIds].map((id) => ({
          trackId: id,
          error: String(e),
        })),
      });
    }
    setSubmitting(false);
  };

  // 关闭
  const handleClose = () => {
    if (result && result.failed === 0) {
      clearSelection();
    }
    onClose();
  };

  return (
    <div className="batch-overlay" onClick={handleClose}>
      <div className="batch-dialog glass-panel-strong" onClick={(e) => e.stopPropagation()}>
        {/* 标题 */}
        <div className="batch-header">
          <h2 className="batch-title">批量编辑标签</h2>
          <span className="batch-count text-muted">
            已选中 {selectedTrackIds.size} 首曲目
          </span>
        </div>

        {loading ? (
          <div className="batch-loading">
            <div className="batch-loading-spinner" />
            <span className="text-muted">正在加载标签...</span>
          </div>
        ) : result ? (
          /* 结果显示 */
          <div className="batch-result">
            <div className="batch-result-summary">
              {result.failed === 0 ? (
                <p className="batch-success">✓ 成功更新 {result.updated} 首曲目</p>
              ) : (
                <>
                  <p className="batch-partial">
                    成功 {result.updated} 首，失败 {result.failed} 首
                  </p>
                  {result.errors.length > 0 && (
                    <div className="batch-errors">
                      {result.errors.slice(0, 10).map((err, i) => (
                        <div key={i} className="batch-error-item">
                          <span className="text-muted">曲目 {err.trackId}:</span> {err.error}
                        </div>
                      ))}
                      {result.errors.length > 10 && (
                        <div className="text-muted">…还有 {result.errors.length - 10} 条</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="batch-actions">
              <button className="primary" onClick={handleClose}>完成</button>
            </div>
          </div>
        ) : (
          /* 编辑表单 */
          <>
            {/* 基本信息字段 */}
            <div className="batch-fields">
              <div className="batch-section-label text-muted">基本信息</div>
              {FIELD_DEFS.map((field) => {
                const enabled = enabledFields.has(field.key);
                return (
                  <div key={field.key} className="batch-field">
                    <label className="batch-field-check">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleField(field.key)}
                      />
                      <span className="batch-field-label">{field.label}</span>
                    </label>
                    <input
                      type={field.type}
                      className="batch-field-input"
                      disabled={!enabled}
                      value={values[field.key] ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={enabled ? '输入新值' : ''}
                    />
                  </div>
                );
              })}
            </div>

            {/* 歌词字段 */}
            <div className="batch-fields batch-section">
              <div className="batch-section-label text-muted">歌词</div>
              <div className="batch-field batch-field-full">
                <label className="batch-field-check">
                  <input
                    type="checkbox"
                    checked={lyricsEnabled}
                    onChange={() => setLyricsEnabled(!lyricsEnabled)}
                  />
                  <span className="batch-field-label">嵌入歌词 (USLT)</span>
                </label>
              </div>
              <textarea
                className="batch-lyrics-input"
                disabled={!lyricsEnabled}
                value={lyricsValue}
                onChange={(e) => setLyricsValue(e.target.value)}
                placeholder={
                  lyricsEnabled
                    ? '粘贴 LRC 或纯文本歌词...\n\n支持时间戳格式如：\n[00:12.34]第一行歌词'
                    : '勾选上方复选框以编辑歌词'
                }
                rows={5}
              />
            </div>

            {/* 封面字段 */}
            <div className="batch-fields batch-section">
              <div className="batch-section-label text-muted">封面图片</div>
              <div className="batch-cover-area">
                <label className="batch-field-check">
                  <input
                    type="checkbox"
                    checked={coverEnabled}
                    onChange={(e) => {
                      setCoverEnabled(e.target.checked);
                      if (!e.target.checked) handleClearCover();
                    }}
                  />
                  <span className="batch-field-label">设置封面</span>
                </label>

                {coverPreview ? (
                  <div className="batch-cover-preview">
                    <img src={coverPreview} alt="封面预览" />
                    <button className="batch-cover-clear" onClick={handleClearCover}>
                      ✕ 移除
                    </button>
                  </div>
                ) : (
                  <div
                    className={`batch-cover-upload ${!coverEnabled ? 'disabled' : ''}`}
                    onClick={() => coverEnabled && fileInputRef.current?.click()}
                  >
                    <div className="batch-cover-upload-icon">🖼️</div>
                    <span>{coverEnabled ? '点击选择图片' : '先勾选启用'}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      支持 JPEG / PNG / WebP，最大 10MB
                    </span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handleCoverSelect}
                />
              </div>
            </div>

            {/* 模式切换 */}
            <div className="batch-mode">
              <span className="batch-mode-label text-muted">写入模式：</span>
              <label className="batch-mode-option">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'overwrite'}
                  onChange={() => setMode('overwrite')}
                />
                <span>覆盖所有</span>
              </label>
              <label className="batch-mode-option">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'fillEmpty'}
                  onChange={() => setMode('fillEmpty')}
                />
                <span>仅填充空字段</span>
              </label>
            </div>

            {/* 操作按钮 */}
            <div className="batch-actions">
              <button onClick={handleClose}>取消</button>
              <button
                className="primary"
                onClick={handleSubmit}
                disabled={submitting || (enabledFields.size === 0 && !lyricsEnabled && !coverEnabled)}
              >
                {submitting ? '写入中…' : '写入'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
