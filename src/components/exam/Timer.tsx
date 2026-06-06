'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  expiresAt: number;
  totalMs: number;
  onExpire: () => void;
}

export default function Timer({ expiresAt, totalMs, onExpire }: Props) {
  const t = useTranslations('exam');
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));
  const fired = useRef(false);
  const stableExpire = useRef(onExpire);
  stableExpire.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      if (r === 0 && !fired.current) {
        fired.current = true;
        stableExpire.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const pct = Math.min(100, (remaining / totalMs) * 100);
  const warn = remaining < 15 * 60_000;

  return (
    <div className="exam-timer">
      <div className="timer-label">{t('timeRemaining')}</div>
      <div className={`timer-display${warn ? ' warning' : ''}`}>{fmt(remaining)}</div>
      <div className="timer-bar">
        <div className={`timer-fill${warn ? ' warning' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
