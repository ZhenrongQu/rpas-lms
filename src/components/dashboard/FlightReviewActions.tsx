'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function FlightReviewActions({
  locale,
  canReschedule,
}: {
  locale: string;
  canReschedule: boolean;
}) {
  const t = useTranslations('flightReview');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!window.confirm(t('cancelConfirm'))) return;
    setBusy(true);
    await fetch(`/api/flight-review/book?locale=${locale}`, { method: 'DELETE' }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="fr-actions">
      {canReschedule && (
        <Link href={`/${locale}/flight-review`} className="btn-review">
          {t('reschedule')}
        </Link>
      )}
      <button type="button" className="btn-cancel" onClick={cancel} disabled={busy}>
        {t('cancel')}
      </button>
    </div>
  );
}
