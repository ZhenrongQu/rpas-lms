"use client";

import { useState } from "react";

export default function PurchaseButton({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) throw new Error("checkout failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className="btn-review" onClick={startCheckout} disabled={loading}>
      {loading ? "Opening checkout..." : "Unlock paid lessons"}
    </button>
  );
}
