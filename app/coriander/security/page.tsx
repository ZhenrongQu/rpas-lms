import MfaManager from "./MfaManager";

// SEC-16: admin self-service MFA (TOTP) enrollment. Gated by the coriander
// layout, which only renders children for an authenticated admin.
export default function SecurityPage() {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Security</h1>
      </div>
      <MfaManager />
    </div>
  );
}
