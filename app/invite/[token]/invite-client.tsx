"use client";

import { useEffect, useState } from "react";
import { Home, UserPlus } from "lucide-react";

type InvitePreview = { householdName: string; invitedBy: string; expiresAt: string };
type SessionUser = { id: string; displayName: string; role: "member" | "administrator" };

export function InviteClient({ token }: { token: string }) {
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [invalid, setInvalid] = useState("");
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    Promise.all([fetch(`/api/invites/${token}`, { cache: "no-store" }), fetch("/api/session", { cache: "no-store" })]).then(async ([inviteResponse, sessionResponse]) => {
      const inviteBody = await inviteResponse.json();
      if (!inviteResponse.ok) { setInvalid(inviteBody.error ?? "This invite link is not valid or has expired."); return; }
      setInvite(inviteBody.invite);
      if (sessionResponse.ok) setSessionUser((await sessionResponse.json()).user);
    }).catch(() => setInvalid("The invite could not be checked. Try again.")).finally(() => setLoading(false));
  }, [token]);

  async function accept(body?: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/invites/${token}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The invite could not be accepted");
      location.href = "/";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The invite could not be accepted"); setBusy(false); }
  }

  if (loading) return <main className="loading-screen"><span className="brand-mark"><span className="roof" /><span className="door" /></span><p>Checking your invite…</p></main>;

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div>
    <span className="setup-icon">{invalid ? <Home size={24} /> : <UserPlus size={24} />}</span>
    {invalid ? <>
      <h1>Invite not available</h1>
      <p>{invalid}</p>
      <a className="secondary-button" href="/login">Go to sign in</a>
    </> : sessionUser?.role === "administrator" ? <>
      <h1>Administrator accounts cannot join</h1>
      <p>You are signed in as an administrator. Administrators manage the system and never participate in Household finances. Sign in with a member account to accept this invite.</p>
      <a className="secondary-button" href="/admin">Back to the admin console</a>
    </> : <>
      <p className="eyebrow">HOUSEHOLD INVITE</p>
      <h1>Join {invite?.householdName}</h1>
      <p>{invite?.invitedBy} invited you to share household expenses in {invite?.householdName}.</p>
      {sessionUser ? <form onSubmit={(event) => { event.preventDefault(); void accept(); }}>
        <p>You are signed in as <strong>{sessionUser.displayName}</strong>.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Joining…" : `Join ${invite?.householdName}`}</button>
      </form> : <form onSubmit={(event) => { event.preventDefault(); void accept({ displayName, email, password }); }}>
        <label>Display name<input autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoFocus /></label>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="new-password" minLength={12} placeholder="12+ characters with upper, lower, and a number" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Creating account…" : "Create account and join"}</button>
        <p className="auth-footnote">Already have a FairShare account? <a href="/login">Sign in first</a>, then open this invite link again.</p>
      </form>}
    </>}
  </section></main>;
}
