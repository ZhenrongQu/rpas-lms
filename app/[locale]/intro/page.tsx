import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function IntroPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return (
    <div className="dashboard-content" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div>
        <div className="dash-callsign">{t('modules.intro')}</div>
        <div className="dash-title">{t('intro.title')}</div>
        <div className="dash-subtitle">RPAS ACADEMY · INTRO MODULE</div>
      </div>

      <div className="modules-grid" style={{ gridTemplateColumns: '1fr', marginTop: 24 }}>
        {(['company', 'service', 'course'] as const).map((section) => (
          <section key={section} className="hud-panel" style={{ padding: 22 }}>
            <div className="breakdown-title">
              {t(`intro.${section}Title`)}
            </div>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
              {t(`intro.${section}Body`)}
            </p>
          </section>
        ))}
      </div>

      <Link href={`/${locale}/register`} className="btn-launch" style={{ width: 'fit-content' }}>
        ▶ {t('intro.cta')}
      </Link>
    </div>
  );
}
