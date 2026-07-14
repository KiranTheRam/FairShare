"use client";

import { ArrowLeft, Check, LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isThemeId, THEMES, type ThemeId } from "@/lib/themes";

type SessionData = { user: { id: string; email: string; displayName: string }; csrfToken: string };
type NotificationPrefs = { billsEnabled: boolean; paymentsEnabled: boolean; balanceChangesEnabled: boolean };

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const applyTheme = (next: string) => { document.documentElement.dataset.theme = next; };

export function SettingsClient() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [preferences, setPreferences] = useState<NotificationPrefs>({ billsEnabled: true, paymentsEnabled: true, balanceChangesEnabled: true });
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [savedNote, setSavedNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    applyTheme("dark");
    Promise.all([fetch("/api/session", { cache: "no-store" }), fetch("/api/settings", { cache: "no-store" })]).then(async ([sessionResponse, settingsResponse]) => {
      if (sessionResponse.status === 401) { location.href = "/login"; return; }
      setSession(await sessionResponse.json() as SessionData);
      const settings = settingsResponse.ok ? await settingsResponse.json() : null;
      const savedTheme: ThemeId = isThemeId(settings?.account?.themePreference) ? settings.account.themePreference : "dark";
      setTheme(savedTheme);
      applyTheme(savedTheme);
      if (settings?.notifications) setPreferences({ billsEnabled: settings.notifications.billsEnabled, paymentsEnabled: settings.notifications.paymentsEnabled, balanceChangesEnabled: settings.notifications.balanceChangesEnabled });
      setVapidPublicKey(settings?.vapidPublicKey ?? null);
    }).catch(() => setError("Your settings could not be loaded. Refresh to try again.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!savedNote) return; const timer = setTimeout(() => setSavedNote(""), 2600); return () => clearTimeout(timer); }, [savedNote]);

  useEffect(() => {
    if (!vapidPublicKey) return;
    let cancelled = false;
    async function syncPushState() {
      await Promise.resolve();
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setPushSupported(false);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setPushSupported(true);
          setPushPermission(Notification.permission);
          setPushEnabled(Boolean(subscription));
        }
      } catch { if (!cancelled) setPushSupported(false); }
    }
    void syncPushState();
    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  async function mutate(path: string, method: string, body?: unknown) {
    if (!session) throw new Error("Session is unavailable");
    const response = await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Request failed");
    return result;
  }

  async function chooseTheme(next: ThemeId) {
    const previous = theme;
    setTheme(next); applyTheme(next); setError("");
    try { await mutate("/api/settings", "PATCH", { themePreference: next }); setSavedNote("Theme saved to your account"); }
    catch (cause) { setTheme(previous); applyTheme(previous); setError(cause instanceof Error ? cause.message : "The theme could not be saved"); }
  }

  async function togglePreference(key: keyof NotificationPrefs) {
    const next = { ...preferences, [key]: !preferences[key] };
    const previous = preferences;
    setPreferences(next); setError("");
    try { await mutate("/api/settings", "PATCH", { notifications: next }); setSavedNote("Notification preferences saved"); }
    catch (cause) { setPreferences(previous); setError(cause instanceof Error ? cause.message : "Preferences could not be saved"); }
  }

  async function enablePush() {
    if (!vapidPublicKey) throw new Error("Web Push is not configured on this server");
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== "granted") throw new Error("Push permission is blocked. Allow notifications in your browser or device settings, then try again.");
    const registration = await navigator.serviceWorker.ready;
    const padding = "=".repeat((4 - vapidPublicKey.length % 4) % 4);
    const bytes = Uint8Array.from(atob((vapidPublicKey + padding).replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await mutate("/api/settings/push", "POST", subscription.toJSON());
    setPushEnabled(true);
    setSavedNote("Push enabled on this device");
  }

  async function togglePush() {
    setPushBusy(true); setError("");
    try {
      if (pushEnabled) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await mutate("/api/settings/push", "DELETE", { endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setPushEnabled(false);
        setSavedNote("Push disabled on this device");
      } else {
        await enablePush();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Push settings could not be changed"); }
    finally { setPushBusy(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordBusy(true); setError("");
    try {
      await mutate("/api/settings/password", "POST", { currentPassword, newPassword });
      location.href = "/login";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password could not be changed"); setPasswordBusy(false); }
  }

  async function logout() {
    try { await mutate("/api/auth/logout", "POST"); } finally { location.href = "/login"; }
  }

  if (loading) return <main className="loading-screen"><span className="brand-mark"><span className="roof" /><span className="door" /></span><p>Loading settings…</p></main>;

  return <div className="settings-shell">
    <header className="settings-topbar">
      <Link className="settings-back" href="/"><ArrowLeft size={17} /> Back to FairShare</Link>
      <div className="brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div>
    </header>
    <main className="settings-wrap">
      <div className="page-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><div className="page-title-row"><h1>Settings</h1>{savedNote && <span className="settings-saved"><Check size={14} /> {savedNote}</span>}</div><p>Appearance, notifications, and security for your account.</p></div></div>
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      <div className="settings-account"><span className="avatar mint" aria-hidden>{initials(session?.user.displayName ?? "")}</span><span><strong>{session?.user.displayName}</strong><small>{session?.user.email}</small></span><span className="status-pill done">Active</span></div>

      <section className="settings-section">
        <h2>Appearance</h2>
        <p>Your theme is saved to your account and follows you to every device.</p>
        <div className="theme-grid">{THEMES.map((item) => <button key={item.id} className={`theme-card ${theme === item.id ? "selected" : ""}`} onClick={() => void chooseTheme(item.id)} aria-pressed={theme === item.id}>
          <span className="theme-swatch" style={{ background: item.preview.canvas }} aria-hidden>
            <span className="swatch-hero" style={{ background: item.preview.hero }} />
            <span className="swatch-row" style={{ background: item.preview.paper, color: item.preview.primary }}><span style={{ background: item.preview.primary }} /><span style={{ background: item.preview.accent }} /><i /></span>
          </span>
          <span className="theme-meta"><strong>{item.name}</strong><small>{item.tagline}</small></span>
          {theme === item.id && <span className="theme-check"><Check size={13} /></span>}
        </button>)}</div>
      </section>

      <section className="settings-section">
        <h2>Notifications</h2>
        <p>Choose which Household events create in-app and push notifications.</p>
        <div className="notification-preferences">
          <label><span><strong>Bills and material edits</strong><small>New, edited, finalized, and recurring bills</small></span><input type="checkbox" checked={preferences.billsEnabled} onChange={() => void togglePreference("billsEnabled")} /></label>
          <label><span><strong>Payments involving you</strong><small>Bill-specific and general repayments</small></span><input type="checkbox" checked={preferences.paymentsEnabled} onChange={() => void togglePreference("paymentsEnabled")} /></label>
          <label><span><strong>Balance changes</strong><small>Reminders and meaningful changes to what you owe or are owed</small></span><input type="checkbox" checked={preferences.balanceChangesEnabled} onChange={() => void togglePreference("balanceChangesEnabled")} /></label>
        </div>
        {!vapidPublicKey ? <div className="push-status"><strong>Push notifications need server setup</strong><p>The FairShare operator must generate VAPID keys, set <code>VAPID_SUBJECT</code>, <code>VAPID_PUBLIC_KEY</code>, and <code>VAPID_PRIVATE_KEY</code> in the deployment environment, then restart FairShare. This cannot be enabled from a user account.</p></div>
          : pushSupported === false ? <div className="push-status"><strong>This browser cannot receive Web Push</strong><p>Use a supported browser. On iPhone or iPad, install FairShare to the Home Screen and open the installed app before enabling push.</p></div>
          : <div className="notification-preferences push-preference"><label><span><strong>Push on this device</strong><small>{pushPermission === "denied" ? "Blocked in browser or device settings" : pushEnabled ? "Notifications can appear when FairShare is closed" : "Enable alerts from this browser or installed app"}</small></span><input type="checkbox" checked={pushEnabled} disabled={pushBusy || pushSupported !== true} onChange={() => void togglePush()} /></label></div>}
      </section>

      <section className="settings-section">
        <h2>Change password</h2>
        <p>Changing your password signs out every device, including this one.</p>
        <form className="settings-password-form" onSubmit={changePassword}>
          <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <label>New password<input type="password" autoComplete="new-password" placeholder="12+ characters with upper, lower, and a number" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
          <button className="secondary-button" disabled={passwordBusy}>{passwordBusy ? "Changing…" : "Change password"}</button>
        </form>
      </section>

      <section className="settings-section">
        <div className="settings-signout">
          <p>Signing out ends your session on this device only.</p>
          <button className="secondary-button" onClick={() => void logout()}><LogOut size={16} /> Sign out</button>
        </div>
      </section>
    </main>
  </div>;
}
