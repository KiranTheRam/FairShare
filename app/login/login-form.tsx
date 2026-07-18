"use client";

import { useEffect, useState } from "react";
import { isThemeId } from "@/lib/themes";
import { PasswordInput } from "@/app/password-input";

export function LoginForm({ initialSetup }: { initialSetup: boolean }) {
  const [setup, setSetup] = useState(initialSetup);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Pre-auth pages can't know the account theme; use the device's last-used one.
  useEffect(() => {
    const saved = localStorage.getItem("fairshare-theme");
    document.documentElement.dataset.theme = saved && isThemeId(saved) ? saved : "light";
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(setup ? "/api/auth/bootstrap" : "/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(setup ? { email, displayName, password, setupToken } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 429 ? "Too many attempts — wait 15 minutes and try again." : data.error ?? "Authentication failed");
      location.href = data.user.role === "administrator" ? "/admin" : "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally { setBusy(false); }
  }

  return <main className="auth-shell"><section className="auth-card">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="auth-appicon" src="/app-icon-192.png" alt="" width={54} height={54} />
    <div className="auth-brand">FairShare</div>
    <p className="eyebrow">{setup ? "SECURE INITIAL SETUP" : "HOUSEHOLD LEDGER"}</p>
    <h1>{setup ? "Create the first administrator" : "Welcome back"}</h1>
    {setup && <p>Use the one-time setup token configured on your server.</p>}
    <hr className="auth-rule" />
    <form onSubmit={submit}>
      {setup && <label>Display name<input autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>}
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!setup} /></label>
      <label>Password<PasswordInput autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={setup ? 12 : 1} required /></label>
      {setup && <label>Setup token<PasswordInput autoComplete="off" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}</button>
    </form>
    {!initialSetup && (setup
      ? <button className="auth-switch" type="button" onClick={() => setSetup(false)}>‹ Back to sign in</button>
      : <p className="auth-note">Ask your household admin if you’re locked out.</p>)}
  </section></main>;
}
