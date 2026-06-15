"use client";

import { useState } from "react";

export default function PurchaseButton({
  locale,
  product,
  label,
  className,
}: {
  locale: string;
  product?: string;
  label?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(product ? { locale, product } : { locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Checkout unavailable — payment is not configured yet.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className={className ?? "btn-review"} onClick={startCheckout} disabled={loading}>
        {loading ? "Opening checkout…" : (label ?? "Unlock paid lessons")}
      </button>
      {error && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", maxWidth: 320 }}>
          {error}
        </div>
      )}
    </div>
  );
}
