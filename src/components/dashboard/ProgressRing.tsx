interface Props {
  pct: number; // 0..100
  size?: number;
  label?: string;
  sublabel?: string;
}

export default function ProgressRing({ pct, size = 96, label, sublabel }: Props) {
  const stroke = 8;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circ * (1 - clamped / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--surface-2)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {label && (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: size > 100 ? 24 : 18, fontWeight: 700, color: 'var(--accent-text)' }}>
            {label}
          </div>
        )}
        {sublabel && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
