// ===== 自定义标题栏（decorations:false，程序化拖拽） =====
import { getCurrentWindow } from '@tauri-apps/api/window';
import { APP_NAME } from '../branding';

const appWindow = getCurrentWindow();

export default function TitleBar() {
  const handleDragStart = (e: React.MouseEvent) => {
    // 仅左键触发拖拽
    if (e.button === 0) {
      e.preventDefault();
      appWindow.startDragging();
    }
  };

  return (
    <div className="titlebar" onMouseDown={handleDragStart}>
      {/* 左侧拖拽区 */}
      <div className="titlebar-left">
        <span className="titlebar-title">{APP_NAME}</span>
      </div>

      {/* 右侧窗口控制按钮 */}
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          title="最小化"
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={() => appWindow.minimize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          title="最大化"
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={() => appWindow.toggleMaximize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-close"
          title="关闭"
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={() => appWindow.close()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
