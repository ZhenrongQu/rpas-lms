import { getTranslations } from 'next-intl/server';
import {
  IconDeviceLaptop,
  IconChecklist,
  IconClipboardCheck,
  IconDrone,
} from '@tabler/icons-react';
import Reveal from './Reveal';

// Study → Practice → Mock exam → Get certified (and fly).
const STEP_ICONS = [IconDeviceLaptop, IconChecklist, IconClipboardCheck, IconDrone];

export default async function Flow({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.flow' });
  const steps = t.raw('steps') as { no: string; title: string; body: string }[];

  return (
    <section className="home-section" id="how">
      <div className="home-inner">
        <Reveal>
          <h2 className="home-h2">{t('title')}</h2>
        </Reveal>
        <div className="flow-grid">
          {steps.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? IconDrone;
            return (
              <Reveal key={i} className="flow-step" delay={i * 0.08}>
                <div className="flow-step-head">
                  <span className="flow-icon">
                    <Icon size={26} stroke={1.6} />
                  </span>
                  <span className="flow-no">{s.no}</span>
                </div>
                <div className="flow-title">{s.title}</div>
                <p className="flow-body">{s.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
