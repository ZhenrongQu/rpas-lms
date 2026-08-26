"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics/client";

type Pending = { url: string; credits: number };

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
  const t = useTranslations("billing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server reports unused review credits: hold the checkout here and
  // let the buyer choose, rather than redirecting them into a duplicate purchase.
  const [pending, setPending] = useState<Pending | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    // U7 conversion funnel: fired on intent, before the Stripe round-trip, so the
    // drop-off between "clicked buy" and "paid" is measurable.
    track("checkout_initiated", { product: product ?? "paid_access" });
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(product ? { locale, product } : { locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string; availableCredits?: number };
      if (!res.ok) {
        setError(
          data.error === "already_owned"
            ? t("alreadyOwned")
            : (data.error ?? t("checkoutUnavailable")),
        );
        return;
      }
      if (!data.url) return;
      if (data.availableCredits && data.availableCredits > 0) {
        setPending({ url: data.url, credits: data.availableCredits });
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", maxWidth: 320 }}>
          {t("unusedCreditsWarning", { count: pending.credits })}
        </div>
        <Link href={`/${locale}/flight-review`} className={className ?? "btn-review"}>
          {t("bookNow")}
        </Link>
        <button
          type="button"
          className="btn-cancel"
          onClick={() => { window.location.href = pending.url; }}
        >
          {t("buyAnyway")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className={className ?? "btn-review"} onClick={startCheckout} disabled={loading}>
        {loading ? t("openingCheckout") : (label ?? t("defaultCta"))}
      </button>
      {error && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", maxWidth: 320 }}>
          {error}
        </div>
      )}
    </div>
  );
}
