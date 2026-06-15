'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatSlotDateTime } from '@/lib/flightReview/format';

type Slot = { id: string; startsAt: string; durationMin: number; location: string; examinerName: string };
type Current = { slotId: string; startsAt: string; location: string; examinerName: string } | null;

export default function BookingClient({
  locale,
  slots,
  current,
}: {
  locale: string;
  slots: Slot[];
  current: Current;
}) {
  const t = useTranslations('flightReview');
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function book(slotId: string) {
    setBusyId(slotId);
    setError(null);
    try {
      const res = await fetch('/api/flight-review/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, locale }),
      });
      if (!res.ok) {
        setError(res.status === 409 ? t('bookingError') : t('genericError'));
        router.refresh(); // a 409 likely means the slot was just taken — refresh the list
        return;
      }
      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError(t('genericError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fr-booking">
      {error && <div className="fr-error">{error}</div>}

      {current && (
        <div className="fr-current">
          <span className="fr-current-label">{t('currentlyBooked')}</span>
          <span className="fr-slot-when">{formatSlotDateTime(new Date(current.startsAt), locale)}</span>
          <span className="fr-slot-meta">
            {current.location} · {current.examinerName}
          </span>
        </div>
      )}

      {slots.length === 0 ? (
        <p className="fr-empty">{t('noSlots')}</p>
      ) : (
        <ul className="fr-slot-list">
          {slots.map((s) => (
            <li key={s.id} className="fr-slot">
              <div className="fr-slot-info">
                <span className="fr-slot-when">{formatSlotDateTime(new Date(s.startsAt), locale)}</span>
                <span className="fr-slot-meta">
                  {s.location} · {s.examinerName} · {s.durationMin} {t('minutes')}
                </span>
              </div>
              <button
                type="button"
                className="btn-launch"
                onClick={() => book(s.id)}
                disabled={busyId !== null}
              >
                {busyId === s.id ? t('booking') : current ? t('reschedule') : t('selectSlot')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
