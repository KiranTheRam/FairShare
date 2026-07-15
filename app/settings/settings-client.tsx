"use client";

import { ArrowLeft, Check, LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/app/password-input";
import { isThemeId, THEMES, type ThemeId } from "@/lib/themes";

type SessionData = { user: { id: string; email: string; displayName: string; role?: string }; csrfToken: string };
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
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      <div className="sprofile">
        <span className="avatar mint" aria-hidden>{initials(session?.user.displayName ?? "")}</span>
        <span className="sprofile-id"><strong>{session?.user.displayName}</strong><small>{session?.user.email}{session?.user.role ? ` · ${session.user.role}` : ""}</small></span>
        {savedNote && <span className="settings-saved"><Check size={14} /> {savedNote}</span>}
        <button className="sprofile-out" onClick={() => void logout()}><LogOut size={15} /> Sign out</button>
      </div>

      <div className="settings-cols">
        <div className="settings-col">
          <section className="ssec">
            <h2>Appearance<small>saved to your account, follows you to every device</small></h2>
            <div className="stheme-grid">{THEMES.map((item) => <button key={item.id} className={`stheme${theme === item.id ? " on" : ""}`} onClick={() => void chooseTheme(item.id)} aria-pressed={theme === item.id} title={item.tagline}>
              <span className="stheme-chip" style={{ background: item.preview.canvas }} aria-hidden><i className="stheme-hero" style={{ background: item.preview.hero }} /><i className="stheme-paper" style={{ background: item.preview.paper }} /><i className="stheme-dot" style={{ background: item.preview.primary }} /></span>
              <small>{item.name}</small>
            </button>)}</div>
          </section>

          <section className="ssec">
            <h2>Password<small>changing it signs out every device</small></h2>
            <form className="spw" onSubmit={changePassword}>
              <PasswordInput autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              <PasswordInput autoComplete="new-password" placeholder="New password — 12+ chars with upper, lower, and a number" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <button className="spw-save" disabled={passwordBusy}>{passwordBusy ? "Changing…" : "Change password"}</button>
            </form>
          </section>
        </div>

        <div className="settings-col">
          <section className="ssec">
            <h2>Notifications<small>in-app and push, per event</small></h2>
            <div className="szone">
              <label className="srow"><span><strong>Bills and material edits</strong><small>New, edited, finalized, and recurring bills</small></span><input type="checkbox" checked={preferences.billsEnabled} onChange={() => void togglePreference("billsEnabled")} /></label>
              <label className="srow"><span><strong>Payments involving you</strong><small>Bill-specific and general repayments</small></span><input type="checkbox" checked={preferences.paymentsEnabled} onChange={() => void togglePreference("paymentsEnabled")} /></label>
              <label className="srow"><span><strong>Balance changes</strong><small>Reminders and meaningful changes to what you owe or are owed</small></span><input type="checkbox" checked={preferences.balanceChangesEnabled} onChange={() => void togglePreference("balanceChangesEnabled")} /></label>
              {!vapidPublicKey ? <div className="srow snote"><span><strong>Push notifications need server setup</strong><small>The FairShare operator must set <code>VAPID_SUBJECT</code>, <code>VAPID_PUBLIC_KEY</code>, and <code>VAPID_PRIVATE_KEY</code>, then restart FairShare.</small></span></div>
                : pushSupported === false ? <div className="srow snote"><span><strong>This browser cannot receive Web Push</strong><small>On iPhone or iPad, install FairShare to the Home Screen and open the installed app before enabling push.</small></span></div>
                : <label className="srow"><span><strong>Push on this device</strong><small>{pushPermission === "denied" ? "Blocked in browser or device settings" : pushEnabled ? "Notifications can appear when FairShare is closed" : "Enable alerts from this browser or installed app"}</small></span><input type="checkbox" checked={pushEnabled} disabled={pushBusy || pushSupported !== true} onChange={() => void togglePush()} /></label>}
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>;
}
