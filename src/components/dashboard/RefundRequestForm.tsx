"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Payment = {
  id: string;
  product: string;
  amountTotal: number | null;
  currency: string | null;
  createdAt: string;
  refundStatus: string | null;
};

/** Lets a customer file a refund request against a specific purchase (PRD U5).
 *  Filing only queues it — an admin reviews before any money or access moves. */
export default function RefundRequestForm() {
  const t = useTranslations("billing");
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/payments/refund")
      .then((r) => (r.ok ? r.json() : { payments: [] }))
      .then((d: { payments: Payment[] }) => { if (active) setPayments(d.payments); })
      .catch(() => { if (active) setPayments([]); });
    return () => { active = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: selected, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg(data?.error === "already_requested" ? t("refundAlreadyFiled") : t("refundFailed"));
        return;
      }
      setMsg(t("refundFiled"));
      setReason("");
      setPayments((prev) =>
        prev?.map((p) => (p.id === selected ? { ...p, refundStatus: "PENDING" } : p)) ?? prev,
      );
    } catch {
      setMsg(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  if (payments === null) return null;
  if (payments.length === 0) return <p className="dash-account-note">{t("refundNoPayments")}</p>;

  const refundable = payments.filter((p) => !p.refundStatus);

  return (
    <form onSubmit={submit} className="dash-refund-form">
      <p className="dash-account-note">{t("refundIntro")}</p>
      {refundable.length === 0 ? (
        <p className="dash-account-note">{t("refundAllFiled")}</p>
      ) : (
        <>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} required>
            <option value="">{t("refundSelectPurchase")}</option>
            {refundable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product} · {p.amountTotal === null ? "—" : (p.amountTotal / 100).toFixed(2)}{" "}
                {(p.currency ?? "").toUpperCase()} · {new Date(p.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("refundReasonPlaceholder")}
            rows={3}
            maxLength={1000}
            required
          />
          <button type="submit" className="btn-cancel" disabled={busy}>
            {busy ? t("refundSubmitting") : t("refundSubmit")}
          </button>
        </>
      )}
      {msg && <p className="dash-account-note">{msg}</p>}
    </form>
  );
}
