import type { ReactNode } from 'react';

interface AppShellProps {
  immersive: boolean;
  titleBar: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  drawer: ReactNode;
  player: ReactNode;
  immersiveContent: ReactNode;
  overlays?: ReactNode;
}

export default function AppShell(props: AppShellProps) {
  const { immersive, titleBar, sidebar, main, drawer, player, immersiveContent, overlays } = props;
  if (immersive) {
    return (
      <div className="immersive-shell">
        {titleBar}
        {immersiveContent}
        {overlays}
      </div>
    );
  }
  return (
    <>
      {titleBar}
      <div className="app-body">
        {sidebar}
        {main}
        {drawer}
      </div>
      {player}
      {overlays}
    </>
  );
}
