import { auditEntitlementConsistency } from "@/lib/payments/audit";

const EXPLAIN: Record<string, string> = {
  tier_without_entitlement:
    "Reads as PAID on the tier cache alone, with no live entitlement behind it.",
  entitlement_without_tier:
    "Holds a live entitlement, but the tier cache still says FREE.",
};

/** Runs on load — the audit is a couple of queries, and a stale cached result
 *  would be worse than useless for a consistency check (PRD U5). */
export default async function AdminAuditPage() {
  const drift = await auditEntitlementConsistency();

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Entitlement audit</h1>
      </div>
      <p className="admin-empty">
        `Customer.accessTier` is a cache of the Entitlement table and `hasPaidAccess` ORs the two,
        so drift between them is invisible in normal use — it only surfaces as the wrong answer at
        the wrong moment. Reload this page to re-run the check.
      </p>

      {drift.length === 0 ? (
        <p className="admin-empty">No inconsistencies found.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Tier</th>
              <th>Problem</th>
            </tr>
          </thead>
          <tbody>
            {drift.map((row) => (
              <tr key={row.userId} data-health="fail">
                <td>{row.email ?? row.userId}</td>
                <td>{row.accessTier}</td>
                <td>{EXPLAIN[row.kind] ?? row.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
