"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_API_BASE } from "@/lib/admin/route";

export type RefundRow = {
  id: string;
  status: string;
  reason: string;
  adminNote: string | null;
  createdAt: string;
  customerEmail: string | null;
  product: string;
  amountTotal: number | null;
  currency: string | null;
  creditConsumed: boolean;
};

const REFUNDS_API = `${ADMIN_API_BASE}/refunds`;

function money(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  return `${(amount / 100).toFixed(2)} ${(currency ?? "").toUpperCase()}`.trim();
}

export default function RefundQueue({ initialRequests }: { initialRequests: RefundRow[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(requestId: string, decision: "APPROVE" | "REJECT") {
    const note = window.prompt(
      decision === "APPROVE"
        ? "Approving refunds the payment through Stripe and withdraws what it bought. Note (optional):"
        : "Reason for rejecting (shown in the queue):",
      "",
    );
    if (note === null) return; // cancelled

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(REFUNDS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision, note: note || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { status?: string; error?: unknown } | null;
      if (!res.ok) {
        setMsg(`Error (${res.status}): ${JSON.stringify(data?.error ?? "request failed")}`);
        return;
      }
      setMsg(
        data?.status === "REFUNDING"
          ? "Stripe reports the refund as pending. Access stays until the charge.refunded webhook lands."
          : `Request ${data?.status?.toLowerCase()}.`,
      );
      router.refresh();
    } catch {
      setMsg("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {msg && <p className="admin-empty">{msg}</p>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Filed</th>
            <th>Customer</th>
            <th>Product</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {initialRequests.map((r) => (
            <tr key={r.id} data-health={r.creditConsumed ? "warn" : undefined}>
              <td>{new Date(r.createdAt).toLocaleDateString("en-CA")}</td>
              <td>{r.customerEmail ?? "—"}</td>
              <td>
                {r.product}
                {/* PRD §13.7: a spent credit means the review already happened.
                    Flagged for the admin to weigh, not auto-rejected. */}
                {r.creditConsumed && <strong> · review already delivered</strong>}
              </td>
              <td>{money(r.amountTotal, r.currency)}</td>
              <td>{r.reason}{r.adminNote ? ` · note: ${r.adminNote}` : ""}</td>
              <td>{r.status}</td>
              <td>
                {r.status === "PENDING" ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => decide(r.id, "APPROVE")}>
                      Approve &amp; refund
                    </button>{" "}
                    <button type="button" disabled={busy} onClick={() => decide(r.id, "REJECT")}>
                      Reject
                    </button>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {initialRequests.length === 0 && <p className="admin-empty">No refund requests.</p>}
    </div>
  );
}
