'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#666' }}>出错了，请稍后重试。</p>
        </div>
      </body>
    </html>
  );
}
