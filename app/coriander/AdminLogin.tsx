"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

// Generic, unbranded sign-in shown at the admin path to anyone who isn't an
// authenticated admin. Intentionally says nothing about "admin"/"CMS" so the
// page looks like an ordinary login and doesn't advertise the surface.
function detectMode(value: string): "email" | "phone" | "username" {
  if (value.includes("@")) return "email";
  if (/^\+?[\d\s\-().]{7,}$/.test(value.trim())) return "phone";
  return "username";
}

export default function AdminLogin() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const mode = detectMode(identifier);
    const res = await signIn("admin", {
      [mode]: identifier.trim(),
      password,
      totp: totp.trim(),
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError("Sign-in failed");
      return;
    }
    // The server layout re-checks the DB role: admins get the CMS, everyone
    // else just sees this form again (no hint about who is an admin).
    router.refresh();
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Sign in</h1>
      </div>

      {error && (
        <ul className="admin-errors">
          <li>{error}</li>
        </ul>
      )}

      <form onSubmit={onSubmit} className="admin-form">
        <div className="admin-form-row">
          <label>Email or username</label>
          <input
            type="text"
            autoComplete="username"
            value={identifier}
            required
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="admin-form-row">
          <label>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="admin-form-row">
          <label>Verification code (if enabled)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totp}
            placeholder="000000"
            onChange={(e) => setTotp(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !identifier || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
