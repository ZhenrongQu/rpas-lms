import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { canBookFlightReview } from '@/lib/payments/entitlements';
import { FLIGHT_REVIEW_PRODUCT } from '@/lib/payments/config';
import { getUserBooking } from '@/lib/flightReview/booking';
import { formatSlotDateTime } from '@/lib/flightReview/format';
import PurchaseButton from '@/components/payments/PurchaseButton';
import { isNativeRequest } from '@/lib/platform.server';
import FlightReviewActions from './FlightReviewActions';

export default async function FlightReviewPanel({ userId, locale }: { userId: string; locale: string }) {
  const t = await getTranslations({ locale });
  const [eligible, booking] = await Promise.all([
    canBookFlightReview(userId),
    getUserBooking(userId),
  ]);
  const native = await isNativeRequest();

  return (
    <section className="hud-panel dash-section">
      <div className="hud-panel-glow" />
      <div className="dash-section-title">{t('flightReview.panelTitle')}</div>

      {booking ? (
        <div className="fr-appointment">
          <div className="fr-appointment-detail">
            <span className="fr-label">{t('flightReview.dateTime')}</span>
            <span className="fr-value">{formatSlotDateTime(booking.slot.startsAt, locale)}</span>
          </div>
          <div className="fr-appointment-detail">
            <span className="fr-label">{t('flightReview.location')}</span>
            <span className="fr-value">{booking.slot.location}</span>
          </div>
          <div className="fr-appointment-detail">
            <span className="fr-label">{t('flightReview.examiner')}</span>
            <span className="fr-value">{booking.slot.examinerName}</span>
          </div>
          <FlightReviewActions locale={locale} canReschedule={eligible} />
        </div>
      ) : eligible ? (
        <div className="fr-panel-cta">
          <p className="fr-description">{t('flightReview.description')}</p>
          <Link href={`/${locale}/flight-review`} className="btn-launch">
            {t('flightReview.book')} →
          </Link>
        </div>
      ) : native ? (
        /* Reader-app compliance: no purchase entry inside the native shell. */
        <div className="fr-panel-cta">
          <p className="fr-description">{t('flightReview.lockedNative')}</p>
        </div>
      ) : (
        <div className="fr-panel-cta">
          <p className="fr-description">{t('flightReview.purchaseDescription')}</p>
          <PurchaseButton
            locale={locale}
            product={FLIGHT_REVIEW_PRODUCT}
            label={`${t('flightReview.book')} →`}
            className="btn-launch"
          />
        </div>
      )}
    </section>
  );
}
