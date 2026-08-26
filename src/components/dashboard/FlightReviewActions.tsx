'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function FlightReviewActions({ locale }: { locale: string }) {
  const t = useTranslations('flightReview');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm(t('cancelConfirm'))) return;
    setBusy(true);
    await fetch(`/api/flight-review/book?locale=${locale}`, { method: 'DELETE' }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  // U12: the page is the source of truth for the appointment, so this is a
  // convenience, not a recovery path — but it is the one the student reaches for
  // when the confirmation never arrived.
  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/flight-review/resend?locale=${locale}`, { method: 'POST' });
      setMsg(res.ok ? t('resendSent') : res.status === 429 ? t('resendTooSoon') : t('genericError'));
    } catch {
      setMsg(t('genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fr-actions">
      <Link href={`/${locale}/flight-review`} className="btn-review">
        {t('reschedule')}
      </Link>
      <button type="button" className="btn-review" onClick={resend} disabled={busy}>
        {t('resend')}
      </button>
      <button type="button" className="btn-cancel" data-testid="fr-cancel" onClick={cancel} disabled={busy}>
        {t('cancel')}
      </button>
      {msg && <span className="fr-resend-msg">{msg}</span>}
    </div>
  );
}
