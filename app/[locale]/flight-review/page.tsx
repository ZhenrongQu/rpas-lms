import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { canBookFlightReview } from '@/lib/payments/entitlements';
import { listOpenSlots, getUserBooking } from '@/lib/flightReview/booking';
import BookingClient from '@/components/flightReview/BookingClient';

type Props = { params: Promise<{ locale: string }> };

export default async function FlightReviewPage({ params }: Props) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/signin`);

  const userId = session.user.id;
  if (!(await canBookFlightReview(userId))) redirect(`/${locale}/dashboard`);

  const [slots, booking] = await Promise.all([listOpenSlots(), getUserBooking(userId)]);
  const t = await getTranslations({ locale });

  const slotData = slots.map((s) => ({
    id: s.id,
    startsAt: s.startsAt.toISOString(),
    durationMin: s.durationMin,
    location: s.location,
    examinerName: s.examinerName,
  }));
  const current = booking
    ? {
        slotId: booking.slotId,
        startsAt: booking.slot.startsAt.toISOString(),
        location: booking.slot.location,
        examinerName: booking.slot.examinerName,
      }
    : null;

  return (
    <div className="dash-page">
      <div className="dash-page-inner">
        <section className="hud-panel dash-section">
          <div className="hud-panel-glow" />
          <div className="dash-section-title">{t('flightReview.pageTitle')}</div>
          <p className="fr-description">{t('flightReview.pageSubtitle')}</p>
          <BookingClient locale={locale} slots={slotData} current={current} />
        </section>
      </div>
    </div>
  );
}
