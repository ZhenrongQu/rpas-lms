"use client";

import { useEffect, useState } from "react";

type Enroll = { secret: string; uri: string };

async function postMfa(payload: unknown): Promise<Response> {
  return fetch("/api/coriander/mfa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export default function MfaManager() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/coriander/mfa");
    if (res.ok) setEnabled((await res.json()).enabled);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function begin() {
    setBusy(true);
    setMsg(null);
    const res = await postMfa({ action: "begin" });
    setBusy(false);
    if (res.ok) setEnroll(await res.json());
    else setMsg("Could not start enrollment.");
  }

  async function confirm() {
    setBusy(true);
    setMsg(null);
    const res = await postMfa({ action: "confirm", password, token: code.trim() });
    setBusy(false);
    if (res.ok) {
      setEnroll(null);
      setCode("");
      setPassword("");
      setMsg("Two-factor authentication is now enabled.");
      void refresh();
    } else {
      setMsg("Wrong password, or that code didn't match. Check your authenticator app and try again.");
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    const res = await postMfa({ action: "disable", password, token: code.trim() });
    setBusy(false);
    if (res.ok) {
      setPassword("");
      setCode("");
      setMsg("Two-factor authentication has been disabled.");
      void refresh();
    } else {
      setMsg("Wrong password or code.");
    }
  }

  if (enabled === null) return <p>Loading…</p>;

  return (
    <div className="admin-form" style={{ maxWidth: 520 }}>
      <h2>Two-factor authentication (TOTP)</h2>
      <p>
        Status: <strong>{enabled ? "Enabled" : "Disabled"}</strong>
      </p>
      {msg && <p className="admin-hint">{msg}</p>}

      {!enabled && !enroll && (
        <button type="button" className="btn-primary" onClick={begin} disabled={busy}>
          {busy ? "Working…" : "Enable two-factor"}
        </button>
      )}

      {!enabled && enroll && (
        <div>
          <p>
            Add this secret to your authenticator app (Google Authenticator, Authy, 1Password…), then
            enter the 6-digit code it shows to confirm.
          </p>
          <p>
            Secret: <code>{enroll.secret}</code>
          </p>
          <p style={{ wordBreak: "break-all" }}>
            Or import this URI: <code>{enroll.uri}</code>
          </p>
          <div className="admin-form-row">
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="admin-form-row">
            <label>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              placeholder="000000"
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={confirm}
            disabled={busy || !password || code.trim().length < 6}
          >
            {busy ? "Confirming…" : "Confirm & enable"}
          </button>
        </div>
      )}

      {enabled && (
        <div>
          <p>To turn off two-factor, confirm your password and a current code.</p>
          <div className="admin-form-row">
            <label>Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="admin-form-row">
            <label>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              placeholder="000000"
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={disable}
            disabled={busy || !password || code.trim().length < 6}
          >
            {busy ? "Working…" : "Disable two-factor"}
          </button>
        </div>
      )}
    </div>
  );
}
