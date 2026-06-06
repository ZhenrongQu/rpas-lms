import { getTranslations } from 'next-intl/server';
import type { SubjectScore } from '@/lib/exam/score';

const MODULE_NAMES: Record<string, string> = {
  'air-law': 'Air Law',
  'flight-operations': 'Flight Ops',
  'human-factors': 'Human Factors',
  'meteorology': 'Meteorology',
  'navigation': 'Navigation',
  'airframes-systems': 'Airframes',
  'radiotelephony': 'Radiotelephony',
  'theory-of-flight': 'Theory of Flight',
};

function quality(correct: number, total: number): 'good' | 'warn' | 'poor' {
  const pct = total === 0 ? 1 : correct / total;
  if (pct >= 0.8) return 'good';
  if (pct >= 0.6) return 'warn';
  return 'poor';
}

interface Props {
  bySubject: SubjectScore[];
  locale: string;
}

export default async function SubjectBreakdown({ bySubject, locale }: Props) {
  const t = await getTranslations({ locale });
  const weakModules = bySubject
    .filter((s) => quality(s.correct, s.total) !== 'good')
    .map((s) => MODULE_NAMES[s.moduleId] ?? s.moduleId);

  return (
    <div className="hud-panel breakdown-card">
      <div className="breakdown-title">// {t('results.perSubject')}</div>
      {bySubject.map((s) => {
        const pct = s.total === 0 ? 0 : Math.round((s.correct / s.total) * 100);
        const q = quality(s.correct, s.total);
        return (
          <div key={s.moduleId} className="subject-row">
            <div className="subj-name">{MODULE_NAMES[s.moduleId] ?? s.moduleId}</div>
            <div className="subj-bar">
              <div className={`subj-fill ${q}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="subj-score">{s.correct} / {s.total}</div>
          </div>
        );
      })}
      {weakModules.length > 0 && (
        <div className="weak-areas">
          {t('results.weakAreas')}: <span>{weakModules.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
