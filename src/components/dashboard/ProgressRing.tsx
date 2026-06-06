interface Props {
  pct: number; // 0..100
  size?: number;
  label?: string;
  sublabel?: string;
}

export default function ProgressRing({ pct, size = 96, label, sublabel }: Props) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#00d4ff" strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ filter: 'drop-shadow(0 0 6px #00d4ff)', transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {label && (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: size > 100 ? 26 : 18, fontWeight: 900, color: 'var(--cyan)' }}>
            {label}
          </div>
        )}
        {sublabel && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
