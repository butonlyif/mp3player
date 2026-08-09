import type { ReactNode } from 'react';

export type IconName = 'edit' | 'playlist' | 'remove' | 'trash' | 'close' | 'grip';

const paths: Record<IconName, ReactNode> = {
  edit: <path d="M3 13l3-.7L13 5.3 10.7 3 3.7 10zM9.8 3.9l2.3 2.3" />,
  playlist: <path d="M2.5 4h7M2.5 8h7M2.5 12h5M12 9v5M9.5 11.5H14.5" />,
  remove: <path d="M3 8h10M5 4l-3 4 3 4" />,
  trash: <path d="M3.5 5h9M6 5V3h4v2M5 5l.7 8h4.6l.7-8M7 7v4M9 7v4" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  grip: <path d="M6 3h.01M10 3h.01M6 8h.01M10 8h.01M6 13h.01M10 13h.01" />,
};

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ui-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
}
