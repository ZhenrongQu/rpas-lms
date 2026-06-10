'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';

export default function BillingSuccessPage() {
  const { update } = useSession();
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale ?? 'en';
  const [status, setStatus] = useState<'refreshing' | 'done'>('refreshing');

  useEffect(() => {
    update().then(() => {
      setStatus('done');
      setTimeout(() => router.replace(`/${locale}/dashboard`), 1200);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card" style={{ textAlign: 'center', gap: 16 }}>
        <div className="auth-title" style={{ color: 'var(--green)' }}>
          {status === 'done' ? '✓ Access Unlocked' : '// Confirming payment…'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
          {status === 'done'
            ? 'Redirecting to dashboard…'
            : 'Refreshing your session, please wait.'}
        </div>
      </div>
    </div>
  );
}
