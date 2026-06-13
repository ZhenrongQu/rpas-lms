import { useTranslations } from 'next-intl';
import Link from 'next/link';

const MODULE_ICONS: Record<string, string> = {
  intro: '▣',
  'air-law': '⚖️',
  'flight-operations': '✈️',
  'human-factors': '🧠',
  'meteorology': '⛅',
  'navigation': '🧭',
  'airframes-systems': '⚙️',
  'radiotelephony': '📡',
  'theory-of-flight': '🌪️',
};

interface Props {
  moduleId: string;
  index: number; // 1-based position in the module grid
  progress?: number; // 0..100
  href?: string;
}

export default function ModuleCard({ moduleId, index, progress = 0, href }: Props) {
  const t = useTranslations();
  const idx = String(index).padStart(2, '0');
  const content = (
    <>
      <div className="card-id">MODULE {idx}</div>
      <div className="card-icon">{MODULE_ICONS[moduleId] ?? '▹'}</div>
      <div className="card-name">{t(`modules.${moduleId}`)}</div>
      <div className="card-progress">
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="prog-pct">{progress}%</div>
      </div>
    </>
  );

  if (href) {
    return <Link href={href} className="mission-card">{content}</Link>;
  }

  return <div className="mission-card">{content}</div>;
}
