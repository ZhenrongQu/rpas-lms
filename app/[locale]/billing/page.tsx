import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { auth } from '../../../auth';
import { hasPaidAccess, hasFlightReviewEntitlement } from '@/lib/payments/entitlements';
import { ADVANCED_BUNDLE_PRODUCT, FLIGHT_REVIEW_PRODUCT } from '@/lib/payments/config';
import { isNativeRequest } from '@/lib/platform.server';
import PurchaseButton from '@/components/payments/PurchaseButton';

type Props = { params: Promise<{ locale: string }> };

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  const session = await auth();
  const userId = session?.user?.id;

  // Logged out: a purchase needs an account, so prompt sign-in first.
  if (!userId) {
    return (
      <div className="auth-view">
        <div className="hud-panel auth-card" style={{ textAlign: 'center', gap: 16 }}>
          <div className="auth-title">{t('title')}</div>
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>{t('signInPrompt')}</p>
          <Link href={`/${locale}/signin`} className="btn-launch">{t('signIn')} →</Link>
        </div>
      </div>
    );
  }

  const native = await isNativeRequest();
  const [paid, flightReview] = await Promise.all([
    hasPaidAccess(userId),
    hasFlightReviewEntitlement(userId),
  ]);

  function action(owned: boolean, product: string, cta: string) {
    if (owned) return <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{t('owned')}</span>;
    // Reader-app compliance: never show a purchase entry inside the native shell.
    if (native) return <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{t('manageOnWeb')}</p>;
    return <PurchaseButton locale={locale} product={product} label={cta} className="btn-launch" />;
  }

  return (
    <div className="auth-view">
      <div className="hud-panel" style={{ maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, padding: 28 }}>
        <div>
          <h1 className="auth-title" style={{ marginBottom: 8 }}>{t('title')}</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>{t('subtitle')}</p>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
          <h2 style={{ fontSize: 18 }}>{t('advancedTitle')}</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{t('advancedBody')}</p>
          {action(paid, ADVANCED_BUNDLE_PRODUCT, t('advancedCta'))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
          <h2 style={{ fontSize: 18 }}>{t('flightTitle')}</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{t('flightBody')}</p>
          {action(flightReview, FLIGHT_REVIEW_PRODUCT, t('flightCta'))}
        </section>
      </div>
    </div>
  );
}
