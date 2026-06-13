import { getTranslations } from 'next-intl/server';

export default async function Flow({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.flow' });
  const steps = t.raw('steps') as { no: string; title: string; body: string }[];

  return (
    <section className="home-section" id="how">
      <div className="home-inner">
        <h2 className="home-h2">{t('title')}</h2>
        <div className="flow-grid">
          {steps.map((s, i) => (
            <div key={i} className="flow-step">
              <div className="flow-no">{s.no}</div>
              <div className="flow-title">{s.title}</div>
              <p className="flow-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
