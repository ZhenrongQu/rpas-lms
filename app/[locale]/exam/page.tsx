'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

type CertLevel = 'BASIC' | 'ADVANCED';

export default function ExamLaunchPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<CertLevel>('ADVANCED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function launch() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certLevel: selected, locale: locale.toUpperCase() }),
      });
      if (!res.ok) throw new Error('Failed to create exam session');
      const { sessionId } = await res.json();
      router.push(`/${locale}/exam/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setLoading(false);
    }
  }

  return (
    <div className="exam-launch-page">
      <div style={{ textAlign: 'center' }}>
        <div className="dash-callsign" style={{ display: 'inline-block' }}>
          {t('examLaunch.title').toUpperCase()}
        </div>
        <div className="dash-title" style={{ marginTop: 8 }}>{t('examLaunch.selectLevel')}</div>
      </div>

      <div className="cert-cards">
        {(['BASIC', 'ADVANCED'] as CertLevel[]).map((level) => (
          <div
            key={level}
            className={`hud-panel cert-card${selected === level ? ' selected' : ''}`}
            onClick={() => setSelected(level)}
          >
            <div className="cert-card-level">{t(`certLevel.${level}`)}</div>
            <div className="cert-card-specs">{t(`examSpecs.${level}`)}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <button className="btn-launch" onClick={launch} disabled={loading}>
        {loading ? t('examLaunch.launching') : `▶ ${t('examLaunch.launch')}`}
      </button>
    </div>
  );
}
