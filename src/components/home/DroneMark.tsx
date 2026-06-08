// Quad-drone logo mark (matches the HudHeader glyph), sized for reuse on the Home page.
export default function DroneMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <line x1="20" y1="20" x2="8" y2="8" stroke="#00d4ff" strokeWidth="1.5" />
      <line x1="20" y1="20" x2="32" y2="8" stroke="#00d4ff" strokeWidth="1.5" />
      <line x1="20" y1="20" x2="8" y2="32" stroke="#00d4ff" strokeWidth="1.5" />
      <line x1="20" y1="20" x2="32" y2="32" stroke="#00d4ff" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6" />
      <circle cx="32" cy="8" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6" />
      <circle cx="8" cy="32" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6" />
      <circle cx="32" cy="32" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6" />
      <rect x="15" y="15" width="10" height="10" rx="2" fill="#00d4ff" fillOpacity="0.15" stroke="#00d4ff" strokeWidth="1" />
      <circle cx="20" cy="20" r="2" fill="#00d4ff" />
    </svg>
  );
}
