import { listRefundRequests } from "@/lib/payments/refunds";
import RefundQueue from "./RefundQueue";

export default async function AdminRefundsPage() {
  const requests = await listRefundRequests();

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Refunds</h1>
      </div>
      <p className="admin-empty">
        Approving issues the Stripe refund and withdraws what the payment bought. Some payment
        methods refund asynchronously — those park as REFUNDING until Stripe confirms.
      </p>
      <RefundQueue
        initialRequests={requests.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    </div>
  );
}
