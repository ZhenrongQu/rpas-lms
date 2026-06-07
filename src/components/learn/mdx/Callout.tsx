import type { ReactNode } from 'react';

function Callout({ kind, icon, children }: { kind: string; icon: string; children: ReactNode }) {
  return (
    <div className={`callout callout-${kind}`}>
      <span className="callout-icon">{icon}</span>
      <div className="callout-body">{children}</div>
    </div>
  );
}

export const Tip = ({ children }: { children: ReactNode }) => (
  <Callout kind="tip" icon="▲" children={children} />
);
export const Caution = ({ children }: { children: ReactNode }) => (
  <Callout kind="caution" icon="!" children={children} />
);
export const Note = ({ children }: { children: ReactNode }) => (
  <Callout kind="note" icon="//" children={children} />
);
