import { getTranslations } from 'next-intl/server';

type Row = { feature: string; basic: string; advanced: string };

function Cell({ value }: { value: string }) {
  if (value === 'yes') return <span className="cmp-yes" aria-label="Allowed">✓</span>;
  if (value === 'no') return <span className="cmp-no" aria-label="Not allowed">—</span>;
  return <span className="cmp-note">{value}</span>;
}

export default async function PrivilegesCompare({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.privileges' });
  const rows = t.raw('rows') as Row[];

  return (
    <section className="home-section" id="privileges">
      <div className="home-inner">
        <div className="compare-head">
          <span className="home-kicker">{t('kicker')}</span>
          <h2 className="home-h2">{t('title')}</h2>
          <p className="home-lead">{t('subtitle')}</p>
        </div>

        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th>{t('colFeature')}</th>
                <th className="col-basic">{t('colBasic')}</th>
                <th className="col-adv">{t('colAdvanced')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="cmp-feature">{r.feature}</td>
                  <td className="cmp-basic">
                    <Cell value={r.basic} />
                  </td>
                  <td className="cmp-adv">
                    <Cell value={r.advanced} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="compare-foot">{t('footnote')}</p>
      </div>
    </section>
  );
}
