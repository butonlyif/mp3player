// ===== React 入口 =====
import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App';
import MagicPillWindow from './magicPill/MagicPillWindow';
import { windowRootForLabel } from './windowRoot';
import './theme/tokens.css';
import './styles/global.css';

const label = getCurrentWindow().label;
const rootElement = document.getElementById('root')!;

if (windowRootForLabel(label) === 'magic-pill') {
  document.documentElement.classList.add('magic-pill-root');
  document.body.classList.add('magic-pill-root');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MagicPillWindow />
    </React.StrictMode>,
  );
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
