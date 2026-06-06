import { useTranslations } from 'next-intl';

const MODULE_ICONS: Record<string, string> = {
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
  progress?: number; // 0..100
}

export default function ModuleCard({ moduleId, progress = 0 }: Props) {
  const t = useTranslations();
  const idx = String(['air-law','flight-operations','human-factors','meteorology','navigation','airframes-systems','radiotelephony','theory-of-flight'].indexOf(moduleId) + 1).padStart(2, '0');

  return (
    <div className="mission-card">
      <div className="card-id">// MODULE {idx}</div>
      <div className="card-icon">{MODULE_ICONS[moduleId] ?? '🔹'}</div>
      <div className="card-name">{t(`modules.${moduleId}`)}</div>
      <div className="card-progress">
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="prog-pct">{progress}%</div>
      </div>
    </div>
  );
}
