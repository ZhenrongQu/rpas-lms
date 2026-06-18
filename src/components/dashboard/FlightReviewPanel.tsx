import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { IconCalendarCheck, IconClock, IconMapPin, IconUser } from '@tabler/icons-react';
import { FLIGHT_REVIEW_PRODUCT } from '@/lib/payments/config';
import { formatSlotDateTime } from '@/lib/flightReview/format';
import PurchaseButton from '@/components/payments/PurchaseButton';
import { isNativeRequest } from '@/lib/platform.server';
import type { getUserBooking } from '@/lib/flightReview/booking';
import FlightReviewActions from './FlightReviewActions';

type Booking = Awaited<ReturnType<typeof getUserBooking>>;

/** Flight-review status card. Eligibility/booking/native are computed once on the
 *  dashboard page (also feeds the KPI stat) and passed in to avoid duplicate queries. */
export default async function FlightReviewPanel({
  locale,
  eligible,
  booking,
}: {
  locale: string;
  eligible: boolean;
  booking: Booking;
}) {
  const t = await getTranslations({ locale });
  const native = await isNativeRequest();

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <span className="dash-card-ico"><IconCalendarCheck size={16} stroke={2} /></span>
        {t('flightReview.panelTitle')}
      </div>

      {booking ? (
        <div className="fr-appointment">
          <span className="dash-status-pill ok">{t('dashboard.statusBooked')}</span>
          <div className="fr-detail">
            <span className="fr-detail-ico"><IconClock size={16} stroke={2} /></span>
            <span>
              <span className="fr-label">{t('flightReview.dateTime')}</span>
              <span className="fr-value">{formatSlotDateTime(booking.slot.startsAt, locale)}</span>
            </span>
          </div>
          <div className="fr-detail">
            <span className="fr-detail-ico"><IconMapPin size={16} stroke={2} /></span>
            <span>
              <span className="fr-label">{t('flightReview.location')}</span>
              <span className="fr-value">{booking.slot.location}</span>
            </span>
          </div>
          <div className="fr-detail">
            <span className="fr-detail-ico"><IconUser size={16} stroke={2} /></span>
            <span>
              <span className="fr-label">{t('flightReview.examiner')}</span>
              <span className="fr-value">{booking.slot.examinerName}</span>
            </span>
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
