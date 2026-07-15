"use client";

import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { PasswordInput } from "@/app/password-input";

export function LoginForm({ initialSetup }: { initialSetup: boolean }) {
  const [setup, setSetup] = useState(initialSetup);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (!response.ok) throw new Error(data.error ?? "Authentication failed");
      location.href = data.user.role === "administrator" ? "/admin" : "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally { setBusy(false); }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div>
    <span className="setup-icon">{setup ? <ShieldCheck size={24} /> : <LockKeyhole size={24} />}</span>
    <p className="eyebrow">{setup ? "SECURE INITIAL SETUP" : "WELCOME BACK"}</p>
    <h1>{setup ? "Create the first administrator" : "Sign in to FairShare"}</h1>
    <p>{setup ? "Use the one-time setup token configured on your server." : "Your household ledger is private to authenticated members."}</p>
    <form onSubmit={submit}>
      {setup && <label>Display name<input autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>}
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!setup} /></label>
      <label>Password<PasswordInput autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={setup ? 12 : 1} required /></label>
      {setup && <label>Setup token<PasswordInput autoComplete="off" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}</button>
    </form>
    {!initialSetup && <button className="auth-switch" type="button" onClick={() => setSetup(false)}>Administrator setup is disabled after the first account is created.</button>}
  </section></main>;
}
