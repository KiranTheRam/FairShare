"use client";

import { ArrowDownLeft, Bell, Check, Clock, Copy, Download, FileText, House, Menu, Paperclip, Plus, Settings, Trash2, UserPlus, Users, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Basket, Car, FileX, ForkKnife, HandCoins, House as HouseDuotone, Lightbulb as LightbulbDuotone, Package as PackageDuotone, Repeat as RepeatDuotone, SealCheck, Shapes as ShapesDuotone, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { BILL_CATEGORIES, CATEGORY_LABELS, type BillCategory } from "@/lib/categories";
import { isThemeId } from "@/lib/themes";

type Tab = "friends" | "groups" | "activity";
const TAB_LABELS: Record<Tab, string> = { friends: "Friends", groups: "Groups", activity: "Activity" };
type ModalName = "bill" | "edit" | "payment" | "recurring-edit" | "detail" | "invite" | "claim" | null;
type User = { id: string; email: string; displayName: string; role: "member" | "administrator" };
type HouseholdListItem = { id: string; name: string; currency: string };
type Member = { id: string; displayName: string; email: string };
type Bill = { id: string; name: string; category: BillCategory; amountCents: number; periodLabel: string; dueDate?: string | null; amountState: "estimated" | "final"; status: "draft" | "open" | "settled" | "void"; createdByName?: string; payerUserId?: string | null; payerName?: string | null; obligations?: Array<{ debtorUserId: string; creditorUserId: string; amountCents: number }>; createdAt: string };
type BalanceComponent = { billId: string; billName: string; category: BillCategory; amountCents: number };
type Balance = { payerUserId: string; recipientUserId: string; payerName?: string; recipientName?: string; amountCents: number; components?: BalanceComponent[] };
type Payment = { id: string; billId?: string | null; payerUserId: string; recipientUserId: string; payerName?: string; recipientName?: string; actorName?: string; billName?: string | null; amountCents: number; note?: string | null; paidAt: string };
type Closure = { id: string; billId: string; billName: string; actorName: string; changedAt: string };
type Claim = { id: string; debtorUserId: string; creditorUserId: string; debtorName?: string; creditorName?: string; amountCents: number; note?: string | null; createdAt: string };
type Recurring = { id: string; name: string; category: BillCategory; expectedAmountCents: number | null; cadence: "weekly" | "monthly" | "quarterly" | "yearly"; nextOccurrence: string; allocationMethod: "equal" | "percentage" | "fixed"; templateConfig: { contributions: Array<{ userId: string; amountCents: number }>; allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }> }; active: boolean };
type HouseholdData = { household: HouseholdListItem & { timezone: string }; members: Member[]; bills: Bill[]; balances: Balance[]; simplifiedBalances: Balance[]; payments: Payment[]; closures: Closure[]; claims: Claim[]; recurring: Recurring[] };
type SessionData = { user: User; csrfToken: string; households: HouseholdListItem[] };
type NotificationItem = { id: string; type: string; title: string; body: string; targetPath: string | null; readAt: string | null; createdAt: string };
type BillComment = { id: string; authorUserId: string; authorName: string; body: string; createdAt: string };
type BillAttachment = { id: string; fileName: string; contentType: string; sizeBytes: number; uploadedByUserId: string; uploadedByName: string; createdAt: string };
type InviteItem = { id: string; createdByName: string; expiresAt: string; createdAt: string };
type BillDetailData = { bill: Bill & { revision: number; allocationMethod: string }; contributions: Array<{ id: string; userId: string; displayName: string; amountCents: number; paidAt: string }>; allocations: Array<{ id: string; userId: string; displayName: string; amountCents: number; percentageBasisPoints: number | null }>; obligations: Array<{ id: string; debtorUserId: string; creditorUserId: string; debtorName: string; creditorName: string; originalAmountCents: number; paidAmountCents: number; outstandingAmountCents: number }>; payments: Payment[]; history: Array<{ id: string; changeType: string; changedBy: string; changedAt: string }>; comments: BillComment[]; attachments: BillAttachment[] };

const money = (cents: number, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export function HouseholdApp() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [householdId, setHouseholdId] = useState("");
  const [snapshots, setSnapshots] = useState<Record<string, HouseholdData>>({});
  const [tab, setTab] = useState<Tab>("friends");
  const [friendId, setFriendId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toast, setToast] = useState("");
  const [addAnother, setAddAnother] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [billDetail, setBillDetail] = useState<BillDetailData | null>(null);
  const [paymentContext, setPaymentContext] = useState<(Balance & { note?: string }) | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<Recurring | null>(null);
  const [claimContext, setClaimContext] = useState<{ balance: Balance; existing?: Claim; initialCents?: number } | null>(null);
  const data = householdId ? snapshots[householdId] ?? null : null;
  const allData = useMemo(() => (session?.households ?? []).map((item) => snapshots[item.id]).filter(Boolean) as HouseholdData[], [session, snapshots]);
  // Which household a bill belongs to, so taps work from cross-household feeds.
  const billHomes = useMemo(() => { const map = new Map<string, string>(); for (const snapshot of allData) for (const bill of snapshot.bills) map.set(bill.id, snapshot.household.id); return map; }, [allData]);
  function navTo(next: Tab) { setFriendId(null); setGroupId(null); setTab(next); }
  const mergedActivity = useMemo(() => { if (!allData.length) return null; return { ...allData[0], bills: allData.flatMap((snapshot) => snapshot.bills), payments: allData.flatMap((snapshot) => snapshot.payments), closures: allData.flatMap((snapshot) => snapshot.closures) }; }, [allData]);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    Promise.all([fetch("/api/session", { cache: "no-store" }), fetch("/api/settings", { cache: "no-store" })]).then(async ([sessionResponse, settingsResponse]) => {
      if (sessionResponse.status === 401) { location.href = "/login"; return; }
      const sessionData = await sessionResponse.json() as SessionData;
      const settings = settingsResponse.ok ? await settingsResponse.json() : null;
      setSession(sessionData);
      document.documentElement.dataset.theme = isThemeId(settings?.account?.themePreference) ? settings.account.themePreference : "dark";
      const savedHousehold = localStorage.getItem("fairshare-household");
      setHouseholdId(sessionData.households.some((item) => item.id === savedHousehold) ? savedHousehold! : sessionData.households[0]?.id ?? "");
      if (!sessionData.households.length) setLoading(false);
    }).catch(() => { setError("FairShare could not load your account."); setLoading(false); });
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  // Deep link: push-notification taps open /?bill=<id> as a real URL.
  useEffect(() => {
    if (!householdId) return;
    const billId = new URLSearchParams(location.search).get("bill");
    if (billId) { history.replaceState(null, "", "/"); void openBill(billId); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  // refresh loads every household in the account; keyed by session arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (session?.households.length && householdId) void refresh(); }, [session, householdId === ""]);
  // Other members' changes (payments, bills) never reach an already-open tab on
  // their own, so refetch silently when this tab regains focus and poll gently
  // while it stays visible.
  useEffect(() => {
    if (!householdId) return;
    const refetch = () => { if (document.visibilityState === "visible") void refresh({ silent: true }); };
    const timer = setInterval(refetch, 45_000);
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", refetch);
    return () => { clearInterval(timer); window.removeEventListener("focus", refetch); document.removeEventListener("visibilitychange", refetch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => { setToast(""); setAddAnother(false); }, 4000); return () => clearTimeout(timer); }, [toast]);

  async function refresh(options?: { silent?: boolean }) {
    if (!session) return;
    const silent = options?.silent ?? false;
    if (!silent) { setLoading(true); setError(""); }
    try {
      const entries = await Promise.all(session.households.map(async (item) => {
        const [response, recurringResponse] = await Promise.all([fetch(`/api/households/${item.id}`, { cache: "no-store" }), fetch(`/api/households/${item.id}/recurring`, { cache: "no-store" })]);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load household");
        const recurringBody = recurringResponse.ok ? await recurringResponse.json() : { recurring: [] };
        return [item.id, { ...body, recurring: recurringBody.recurring }] as const;
      }));
      setSnapshots(Object.fromEntries(entries)); localStorage.setItem("fairshare-household", householdId);
      fetch("/api/notifications", { cache: "no-store" }).then(async (list) => { if (list.ok) setNotifications((await list.json()).notifications as NotificationItem[]); }).catch(() => {});
    } catch (cause) { if (!silent) setError(cause instanceof Error ? cause.message : "Unable to load household"); }
    finally { if (!silent) setLoading(false); }
  }

  async function mutate(path: string, method: string, body?: unknown) {
    if (!session) throw new Error("Session is unavailable");
    const response = await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Request failed");
    return result;
  }

  async function openNotifications() {
    setNotificationsOpen((value) => !value);
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (response.ok) {
      const items = (await response.json()).notifications as NotificationItem[];
      setNotifications(items);
      if (items.some((item) => !item.readAt)) {
        await mutate("/api/notifications", "PATCH");
        setNotifications(items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      }
    }
  }

  async function openBill(billId: string) {
    const home = billHomes.get(billId) ?? householdId;
    if (home !== householdId) setHouseholdId(home);
    const response = await fetch(`/api/households/${home}/bills/${billId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setToast(body.error ?? "Bill detail could not be loaded"); return; }
    setBillDetail(body); setModal("detail");
  }

  function openPayment(context: (Balance & { note?: string }) | null = null) { setPaymentContext(context); setModal("payment"); }

  async function addComment(billId: string, body: string) {
    await mutate(`/api/households/${householdId}/bills/${billId}/comments`, "POST", { body });
    await openBill(billId);
  }

  async function uploadAttachment(billId: string, file: File) {
    if (!session) throw new Error("Session is unavailable");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/households/${householdId}/bills/${billId}/attachments`, { method: "POST", headers: { "x-csrf-token": session.csrfToken }, body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The attachment could not be uploaded");
    await openBill(billId);
  }

  async function removeAttachment(billId: string, attachmentId: string) {
    await mutate(`/api/households/${householdId}/bills/${billId}/attachments/${attachmentId}`, "DELETE");
    await openBill(billId);
  }

  function openClaim(balance: Balance, existing?: Claim, initialCents?: number) { setClaimContext({ balance, existing, initialCents }); setModal("claim"); }

  async function cancelClaim(claim: Claim) {
    if (!confirm("Cancel this claim? Your balance is unchanged either way.")) return;
    try { await mutate(`/api/households/${householdId}/claims/${claim.id}`, "DELETE"); setToast("Claim cancelled."); await refresh(); }
    catch (cause) { setToast(cause instanceof Error ? cause.message : "The claim could not be cancelled"); }
  }

  async function dismissClaim(claim: Claim) {
    if (!confirm(`Dismiss ${claim.debtorName ?? "this member"}’s claim? They’ll be told you didn’t receive it, and the balance stays open.`)) return;
    try { await mutate(`/api/households/${householdId}/claims/${claim.id}`, "DELETE"); setToast("Claim dismissed — the balance stays open."); await refresh(); }
    catch (cause) { setToast(cause instanceof Error ? cause.message : "The claim could not be dismissed"); }
  }

  async function sendNudge(debtor: Balance) {
    try {
      await mutate(`/api/households/${householdId}/nudges`, "POST", { debtorUserId: debtor.payerUserId });
      setToast(`${debtor.payerName} was sent a payment reminder.`);
    } catch (cause) { setToast(cause instanceof Error ? cause.message : "The reminder could not be sent"); }
  }

  async function logout() {
    try { await mutate("/api/auth/logout", "POST"); } finally { location.href = "/login"; }
  }

  async function install() {
    if (installPrompt && "prompt" in installPrompt) await (installPrompt as Event & { prompt: () => Promise<void> }).prompt();
    else setToast("Use your browser menu to install FairShare on this device.");
  }

  const title = TAB_LABELS[tab];

  if (loading && !session) return <main className="loading-screen"><span className="brand-mark"><span className="roof" /><span className="door" /></span><p>Loading FairShare…</p></main>;
  if (session && !session.households.length) return <EmptyAccount user={session.user} onLogout={logout} />;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div>
      <label className="household-switcher"><span className="house-avatar">{initials(data?.household.name ?? "House")}</span><span><small>Household</small><strong>{data?.household.name ?? "Loading…"}</strong></span>
        <select aria-label="Choose household" value={householdId} onChange={(e) => setHouseholdId(e.target.value)}>{session?.households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select>
      </label>
      <button className="side-invite" onClick={() => { setModal("invite"); setSidebarOpen(false); }}><UserPlus size={15} /> Invite a roommate</button>
      <nav className="side-nav">{(["friends", "groups", "activity"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => { navTo(item); setSidebarOpen(false); }}>{item === "friends" ? <Users size={19} /> : item === "groups" ? <House size={19} /> : <Clock size={19} />}<span>{TAB_LABELS[item]}</span></button>)}</nav>
      <div className="side-bottom"><a className="side-link" href="/settings"><Settings size={19} /> User settings</a><a className="profile-card" href="/settings"><Avatar name={session?.user.displayName ?? ""} /><span><strong>{session?.user.displayName}</strong><small>{session?.user.email}</small></span></a></div>
    </aside>
    {sidebarOpen && <button className="scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <main className="main"><header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button><div className="top-actions"><button className="install-pill" onClick={install}><ArrowDownLeft size={16} /> Install app</button><button className="icon-button notification-button" onClick={openNotifications} aria-label="Notifications"><Bell size={20} />{notifications.some((item) => !item.readAt) && <span className="unread-dot" />}</button><a className="icon-button" href="/settings" aria-label="User settings"><Settings size={20} /></a><Avatar name={session?.user.displayName ?? ""} /></div>
      {notificationsOpen && <><button className="panel-scrim" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} /><div className="notification-panel"><div className="panel-title"><strong>Notifications</strong><span>{notifications.filter((item) => !item.readAt).length} new</span></div>{notifications.length ? notifications.slice(0, 8).map((item) => { const age = Date.now() - +new Date(item.createdAt); const when = age < 3_600_000 ? `${Math.max(Math.round(age / 60_000), 1)}m ago` : age < 86_400_000 ? `${Math.round(age / 3_600_000)}h ago` : new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }); return <button key={item.id} onClick={() => { setNotificationsOpen(false); const billId = item.targetPath ? new URLSearchParams(item.targetPath.split("?")[1] ?? "").get("bill") : null; if (billId) void openBill(billId); else navTo("friends"); }}>{item.type === "payment" ? <HandCoins size={18} weight="duotone" className="panel-glyph pay" /> : item.type === "balance" ? <Bell size={17} className="panel-glyph balance" /> : <FileText size={17} className="panel-glyph bill" />}<span><strong>{item.title}</strong><small>{item.body}</small></span><time>{when}</time></button>; }) : <p className="panel-empty">You’re all caught up.</p>}</div></>}
    </header>
    <div className="content-wrap"><div className="page-heading"><div><p className="eyebrow">{data?.household.name.toUpperCase()} · {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase()}</p><div className="page-title-row"><h1>{title}</h1></div><p>{tab === "friends" ? "Balances by person, across every group you share." : tab === "groups" ? "Your households and where you stand in each." : "Recent bills, settlements, closures, and payments."}</p></div><div className="heading-actions"><button className="primary-button" onClick={() => setModal("bill")}><Plus size={18} /> Add bill</button></div></div>
      {error && <div className="error-banner">{error}<button onClick={() => void refresh()}>Try again</button></div>}
      {loading || !allData.length ? <div className="wide-card loading-card">Refreshing ledger…</div>
        : tab === "friends" ? (friendId
          ? <FriendDetail households={allData} friendUserId={friendId} user={session!.user} onBack={() => setFriendId(null)} onBillDetail={openBill} onNudge={(home, balance) => { setHouseholdId(home); void sendNudge(balance); }} onClaim={(home, balance, existing) => { setHouseholdId(home); openClaim(balance, existing); }} onCancelClaim={(home, claim) => { setHouseholdId(home); void cancelClaim(claim); }} onDismissClaim={(home, claim) => { setHouseholdId(home); void dismissClaim(claim); }} onConfirmClaim={(home, balance, claim) => { setHouseholdId(home); openPayment({ ...balance, amountCents: Math.min(claim.amountCents, balance.amountCents), note: claim.note ?? undefined }); }} />
          : <Friends households={allData} user={session!.user} onOpenFriend={setFriendId} onInvite={() => setModal("invite")} />)
        : tab === "groups" ? (groupId && snapshots[groupId]
          ? <div className="group-detail"><button className="ledger-back" onClick={() => setGroupId(null)}>‹ GROUPS</button><Bills data={snapshots[groupId]} user={session!.user} onBillDetail={openBill} onEditRecurring={(item) => { setSelectedRecurring(item); setModal("recurring-edit"); }} /></div>
          : <Groups households={allData} user={session!.user} onOpenGroup={(id) => { setGroupId(id); setHouseholdId(id); }} />)
        : <Activity data={mergedActivity!} user={session!.user} householdId={householdId} onBillDetail={openBill} />}
    </div></main>
    <nav className="bottom-nav">{(["friends", "groups", "activity"] as Tab[]).map((item) => <MobileNav key={item} item={item} tab={tab} setTab={navTo} />)}</nav>
    <button className="fab" onClick={() => setModal("bill")} aria-label="Add bill"><Plus size={24} /></button>
    {modal === "bill" && data && <BillModal data={data} currentUserId={session?.user.id} close={() => setModal(null)} save={async (body, recurring) => { await mutate(`/api/households/${householdId}/bills`, "POST", { ...(body as object), ...(recurring ? { recurring } : {}) }); setModal(null); setToast(recurring ? "Bill and recurring schedule added." : "Bill added to the household ledger."); setAddAnother(true); await refresh(); }} />}
    {modal === "edit" && data && billDetail && <BillModal data={data} currentUserId={session?.user.id} initial={billDetail} close={() => setModal("detail")} save={async (body) => { await mutate(`/api/households/${householdId}/bills/${billDetail.bill.id}`, "PATCH", body); setModal(null); setToast("Bill updated and balances recalculated."); await refresh(); }} />}
    {modal === "claim" && data && claimContext && <ClaimModal balance={claimContext.balance} existing={claimContext.existing} initialCents={claimContext.initialCents} currency={data.household.currency} close={() => { setModal(null); setClaimContext(null); }} save={async (body) => { if (claimContext.existing) await mutate(`/api/households/${householdId}/claims/${claimContext.existing.id}`, "PATCH", body); else await mutate(`/api/households/${householdId}/claims`, "POST", body); setModal(null); setClaimContext(null); setToast(claimContext.existing ? "Claim updated." : `${claimContext.balance.recipientName} will be asked to confirm.`); await refresh(); }} />}
    {modal === "payment" && data && <PaymentModal data={data} currentUserId={session?.user.id ?? ""} specific={paymentContext} close={() => { setModal(null); setPaymentContext(null); }} save={async (body) => { await mutate(`/api/households/${householdId}/payments`, "POST", body); setModal(null); setPaymentContext(null); setToast("Payment confirmed."); await refresh(); }} />}
    {modal === "recurring-edit" && data && selectedRecurring && <RecurringModal data={data} initial={selectedRecurring} close={() => setModal(null)} save={async (body) => { await mutate(`/api/households/${householdId}/recurring/${selectedRecurring.id}`, "PATCH", body); setModal(null); setSelectedRecurring(null); setToast("Future recurring bills will use the updated schedule."); await refresh(); }} remove={async () => { if (!confirm("Delete this schedule? Bills it already created are untouched.")) return; try { await mutate(`/api/households/${householdId}/recurring/${selectedRecurring.id}`, "DELETE"); setModal(null); setSelectedRecurring(null); setToast("Schedule deleted."); await refresh(); } catch (cause) { setToast(cause instanceof Error ? cause.message : "The schedule could not be deleted"); } }} />}
    {modal === "invite" && data && <InviteModal householdName={data.household.name} householdId={householdId} mutate={mutate} close={() => setModal(null)} />}
    {modal === "detail" && billDetail && <BillDetailModal detail={billDetail} userId={session?.user.id ?? ""} currency={data?.household.currency ?? "USD"} claims={data?.claims ?? []} canClaim={(item) => Boolean(data?.balances.some((candidate) => candidate.payerUserId === item.debtorUserId && candidate.recipientUserId === item.creditorUserId && candidate.amountCents > 0))} onClaim={(item) => { const balance = data?.balances.find((candidate) => candidate.payerUserId === item.debtorUserId && candidate.recipientUserId === item.creditorUserId); if (balance) { setModal(null); openClaim(balance, undefined, item.outstandingAmountCents); } }} addComment={(body) => addComment(billDetail.bill.id, body)} uploadAttachment={(file) => uploadAttachment(billDetail.bill.id, file)} removeAttachment={(attachmentId) => removeAttachment(billDetail.bill.id, attachmentId)} attachmentHref={(attachmentId) => `/api/households/${householdId}/bills/${billDetail.bill.id}/attachments/${attachmentId}`} close={() => setModal(null)} edit={() => setModal("edit")} remove={async () => { if (!confirm("Remove this bill and recalculate Household balances? The audit record is retained.")) return; try { await mutate(`/api/households/${householdId}/bills/${billDetail.bill.id}`, "DELETE"); setModal(null); setToast("Bill removed and balances recalculated."); await refresh(); } catch (cause) { setToast(cause instanceof Error ? cause.message : "Bill could not be removed"); } }} />}
    {toast && <div className="toast"><span><Check size={16} /></span>{toast}{addAnother && <button className="toast-action" onClick={() => { setToast(""); setAddAnother(false); setModal("bill"); }}>Add another</button>}</div>}
  </div>;
}

function Avatar({ name }: { name: string }) { return <span className="avatar mint small" aria-label={name}>{initials(name)}</span>; }
const CATEGORY_ICONS = {
  housing: HouseDuotone,
  utilities: LightbulbDuotone,
  groceries: Basket,
  dining: ForkKnife,
  transport: Car,
  subscriptions: RepeatDuotone,
  household: PackageDuotone,
  other: ShapesDuotone,
} satisfies Record<BillCategory, PhosphorIcon>;

function MobileNav({ item, tab, setTab }: { item: Tab; tab: Tab; setTab: (value: Tab) => void }) { const Icon = item === "friends" ? Users : item === "groups" ? House : Clock; return <button className={tab === item ? "active" : ""} onClick={() => setTab(item)}><Icon size={21} /><small>{TAB_LABELS[item]}</small></button>; }

type FriendAgg = { userId: string; name: string; net: number; openBills: number; groups: string[] };

function friendAggregates(households: HouseholdData[], userId: string) {
  const map = new Map<string, FriendAgg>();
  for (const snapshot of households) {
    for (const member of snapshot.members) {
      if (member.id === userId) continue;
      const entry = map.get(member.id) ?? { userId: member.id, name: member.displayName, net: 0, openBills: 0, groups: [] };
      if (!entry.groups.includes(snapshot.household.name)) entry.groups.push(snapshot.household.name);
      map.set(member.id, entry);
    }
    for (const balance of snapshot.balances) {
      const other = balance.recipientUserId === userId ? balance.payerUserId : balance.payerUserId === userId ? balance.recipientUserId : null;
      if (!other) continue;
      const entry = map.get(other);
      if (!entry) continue;
      entry.net += balance.recipientUserId === userId ? balance.amountCents : -balance.amountCents;
      entry.openBills += (balance.components ?? []).length;
    }
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

function Friends({ households, user, onOpenFriend, onInvite }: { households: HouseholdData[]; user: User; onOpenFriend: (id: string) => void; onInvite: () => void }) {
  const currency = households[0].household.currency;
  const friends = friendAggregates(households, user.id);
  const net = friends.reduce((sum, friend) => sum + friend.net, 0);
  return <div className="ledger-view">
    <p className="ledger-k">{net > 0 ? "You are owed" : net < 0 ? "You owe" : "All settled"}</p>
    {net !== 0 && <p className={`ledger-big ${net > 0 ? "pos" : "neg"}`}>{money(Math.abs(net), currency)}</p>}
    <hr className="ledger-rule" />
    <div className="ledger-list">
      {friends.map((friend) => <button className="fr-row" key={friend.userId} onClick={() => onOpenFriend(friend.userId)}>
        <span className="fr-avatar">{initials(friend.name)}</span>
        <span className="fr-who"><b>{friend.name}</b><small>{friend.groups.join(" · ")}{friend.openBills ? ` · ${friend.openBills} open bill${friend.openBills === 1 ? "" : "s"}` : ""}</small></span>
        {friend.net === 0 ? <span className="fr-amt zero"><b>settled</b><small>✓</small></span>
          : <span className={`fr-amt ${friend.net > 0 ? "pos" : "neg"}`}><b>{money(Math.abs(friend.net), currency)}</b><small>{friend.net > 0 ? "owes you" : "you owe"}</small></span>}
      </button>)}
      <button className="fr-row invite" onClick={onInvite}><span className="fr-avatar dashed">+</span><span className="fr-who"><b>Invite a roommate</b><small>they join one of your groups</small></span></button>
    </div>
  </div>;
}

function FriendDetail({ households, friendUserId, user, onBack, onBillDetail, onNudge, onClaim, onCancelClaim, onDismissClaim, onConfirmClaim }: { households: HouseholdData[]; friendUserId: string; user: User; onBack: () => void; onBillDetail: (id: string) => void; onNudge: (home: string, balance: Balance) => void; onClaim: (home: string, balance: Balance, existing?: Claim) => void; onCancelClaim: (home: string, claim: Claim) => void; onDismissClaim: (home: string, claim: Claim) => void; onConfirmClaim: (home: string, balance: Balance, claim: Claim) => void }) {
  const shared = households.filter((snapshot) => snapshot.members.some((member) => member.id === friendUserId));
  if (!shared.length) return null;
  const currency = shared[0].household.currency;
  const friendName = shared[0].members.find((member) => member.id === friendUserId)?.displayName ?? "them";
  let net = 0;
  const pairs: Array<{ home: string; balance: Balance; direction: "in" | "out" }> = [];
  for (const snapshot of shared) for (const balance of snapshot.balances) {
    if (balance.recipientUserId === user.id && balance.payerUserId === friendUserId) { net += balance.amountCents; pairs.push({ home: snapshot.household.id, balance, direction: "in" }); }
    if (balance.payerUserId === user.id && balance.recipientUserId === friendUserId) { net -= balance.amountCents; pairs.push({ home: snapshot.household.id, balance, direction: "out" }); }
  }
  const incoming = pairs.find((pair) => pair.direction === "in");
  const outgoing = pairs.find((pair) => pair.direction === "out");
  const claimsToMe: Array<{ home: string; claim: Claim; balance: Balance }> = [];
  let myClaim: { home: string; claim: Claim; balance: Balance } | undefined;
  for (const snapshot of shared) for (const claim of snapshot.claims) {
    if (claim.creditorUserId === user.id && claim.debtorUserId === friendUserId) { const balance = snapshot.balances.find((item) => item.payerUserId === friendUserId && item.recipientUserId === user.id); if (balance) claimsToMe.push({ home: snapshot.household.id, claim, balance }); }
    if (claim.debtorUserId === user.id && claim.creditorUserId === friendUserId && !myClaim) { const balance = snapshot.balances.find((item) => item.payerUserId === user.id && item.recipientUserId === friendUserId); if (balance) myClaim = { home: snapshot.household.id, claim, balance }; }
  }
  type Row = { key: string; when: number; month: string; groupName: string; kind: "bill"; bill: Bill } | { key: string; when: number; month: string; groupName: string; kind: "payment"; payment: Payment };
  const monthOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const rows: Row[] = [];
  const manyGroups = shared.length > 1;
  for (const snapshot of shared) {
    const groupName = snapshot.household.name;
    for (const bill of snapshot.bills) if (bill.payerUserId === user.id || bill.payerUserId === friendUserId) rows.push({ key: `bill:${bill.id}`, when: +new Date(bill.dueDate ?? bill.createdAt), month: bill.periodLabel, groupName, kind: "bill", bill });
    for (const payment of snapshot.payments) if ((payment.payerUserId === user.id && payment.recipientUserId === friendUserId) || (payment.payerUserId === friendUserId && payment.recipientUserId === user.id)) rows.push({ key: `payment:${payment.id}`, when: +new Date(payment.paidAt), month: monthOf(payment.paidAt), groupName, kind: "payment", payment });
  }
  rows.sort((a, b) => b.when - a.when);
  const groups: Array<{ month: string; groupName: string; rows: Row[] }> = [];
  for (const row of rows) { const bucket = groups.find((entry) => entry.month === row.month && entry.groupName === row.groupName); if (bucket) bucket.rows.push(row); else groups.push({ month: row.month, groupName: row.groupName, rows: [row] }); }
  const shareFor = (snapshotBill: Bill) => {
    const lent = (snapshotBill.obligations ?? []).filter((item) => item.creditorUserId === user.id && item.debtorUserId === friendUserId).reduce((sum, item) => sum + item.amountCents, 0);
    const borrowed = (snapshotBill.obligations ?? []).filter((item) => item.debtorUserId === user.id && item.creditorUserId === friendUserId).reduce((sum, item) => sum + item.amountCents, 0);
    if (borrowed > 0) return { label: "you borrowed", amount: money(borrowed, currency), tone: "borrowed" };
    if (lent > 0) return { label: "you lent", amount: money(lent, currency), tone: "lent" };
    return { label: "no share", amount: "—", tone: "done" };
  };
  const firstName = (name?: string | null) => (name ?? "").split(/\s+/)[0] || "Someone";
  return <div className="ledger-view">
    <button className="ledger-back" onClick={onBack}>‹ FRIENDS</button>
    <div className="fr-hero"><span className="fr-avatar big">{initials(friendName)}</span><span className="fr-hero-text"><b>{friendName}</b><small className={net > 0 ? "pos" : net < 0 ? "neg" : ""}>{net > 0 ? `owes you ${money(net, currency)}` : net < 0 ? `you owe ${money(-net, currency)}` : "settled up"}</small></span></div>
    {claimsToMe.map(({ home, claim, balance }) => <div className="ledger-claim" key={claim.id}>
      <p><b>{friendName} says they paid you {money(claim.amountCents, currency)}.</b>{claim.note ? ` “${claim.note}”` : ""}</p>
      <div className="ledger-btnrow"><button className="ledger-btn solid" onClick={() => onConfirmClaim(home, balance, claim)}>Confirm received</button><button className="ledger-btn ghost danger" onClick={() => onDismissClaim(home, claim)}>I didn’t get this</button></div>
    </div>)}
    {(outgoing || incoming) && <div className="ledger-btnrow">
      {outgoing && !myClaim && <button className="ledger-btn solid" onClick={() => onClaim(outgoing.home, outgoing.balance)}>Settle up</button>}
      {incoming && <button className="ledger-btn ghost" onClick={() => onNudge(incoming.home, incoming.balance)}>Remind</button>}
      {myClaim && <button className="ledger-btn ghost" onClick={() => onClaim(myClaim!.home, myClaim!.balance, myClaim!.claim)}>Edit claim</button>}
      {myClaim && <button className="ledger-btn ghost danger" onClick={() => onCancelClaim(myClaim!.home, myClaim!.claim)}>Cancel claim</button>}
    </div>}
    {incoming && !outgoing && !claimsToMe.length && <p className="ledger-note">You owe nothing here — when {friendName} marks a payment as sent, you’ll confirm it right on this page.</p>}
    {!incoming && !outgoing && <p className="ledger-note">You’re all square with {friendName}. 🎉</p>}
    {groups.map((bucket) => <div key={`${bucket.groupName}:${bucket.month}`}>
      <div className="feed-month-head"><b>{manyGroups ? `${bucket.groupName} · ${bucket.month}` : bucket.month}</b><span className="num">{money(bucket.rows.reduce((sum, row) => sum + (row.kind === "bill" ? row.bill.amountCents : 0), 0), currency)}</span></div>
      {bucket.rows.map((row) => {
        if (row.kind === "bill") {
          const bill = row.bill;
          const Icon = CATEGORY_ICONS[bill.category] ?? CATEGORY_ICONS.other;
          const side = shareFor(bill);
          const date = new Date(bill.dueDate ?? bill.createdAt);
          return <button className="feed-row" key={row.key} onClick={() => onBillDetail(bill.id)}>
            <span className="feed-date"><small>{date.toLocaleDateString(undefined, { month: "short" })}</small><b>{date.getDate()}</b></span>
            <Icon size={19} weight="duotone" className={`feed-glyph bill-cat cat-${bill.category}`} aria-hidden="true" />
            <span className="feed-main"><b>{bill.name}</b><small>{bill.payerUserId === user.id ? "You" : firstName(bill.payerName ?? bill.createdByName)} paid {money(bill.amountCents, currency)}</small></span>
            <span className={`feed-side ${side.tone}`}><small>{side.label}</small><b>{side.amount}</b></span>
          </button>;
        }
        const payment = row.payment;
        const date = new Date(payment.paidAt);
        return <button className="feed-row pay" key={row.key} disabled={!payment.billId} onClick={() => payment.billId && onBillDetail(payment.billId)}>
          <span className="feed-date"><small>{date.toLocaleDateString(undefined, { month: "short" })}</small><b>{date.getDate()}</b></span>
          <HandCoins size={19} weight="duotone" className="feed-glyph glyph-pay" aria-hidden="true" />
          <span className="feed-main"><b>{payment.payerUserId === user.id ? "You" : firstName(payment.payerName)} paid {payment.recipientUserId === user.id ? "you" : firstName(payment.recipientName)}</b><small>{payment.billName ? `toward ${payment.billName}` : "payment"} · confirmed</small></span>
          <span className="feed-side pay"><b>{payment.recipientUserId === user.id ? "+" : ""}{money(payment.amountCents, currency)}</b></span>
        </button>;
      })}
    </div>)}
    {!rows.length && <p className="empty-copy">Nothing shared with {friendName} yet.</p>}
  </div>;
}

function Groups({ households, user, onOpenGroup }: { households: HouseholdData[]; user: User; onOpenGroup: (id: string) => void }) {
  return <div className="ledger-view">
    <div className="ledger-list">
      {households.map((snapshot) => {
        const currency = snapshot.household.currency;
        const net = snapshot.balances.reduce((sum, item) => sum + (item.recipientUserId === user.id ? item.amountCents : 0) - (item.payerUserId === user.id ? item.amountCents : 0), 0);
        return <button className="fr-row" key={snapshot.household.id} onClick={() => onOpenGroup(snapshot.household.id)}>
          <span className="gr-avatar">{initials(snapshot.household.name)}</span>
          <span className="fr-who"><b>{snapshot.household.name}</b><small>{snapshot.members.length} {snapshot.members.length === 1 ? "person" : "people"} · {snapshot.bills.filter((bill) => bill.status === "open").length} open bills</small></span>
          {net === 0 ? <span className="fr-amt zero"><b>settled</b><small>✓</small></span>
            : <span className={`fr-amt ${net > 0 ? "pos" : "neg"}`}><b>{money(Math.abs(net), currency)}</b><small>{net > 0 ? "you are owed" : "you owe"}</small></span>}
        </button>;
      })}
    </div>
    <p className="ledger-note">Starting a new group is an admin task for now — ask your administrator.</p>
  </div>;
}

function Bills({ data, user, onBillDetail, onEditRecurring }: { data: HouseholdData; user: User; onBillDetail: (id: string) => void; onEditRecurring: (item: Recurring) => void }) {
  const currency = data.household.currency;
  const [schedOpen, setSchedOpen] = useState(false);
  const schedules = [...data.recurring].sort((a, b) => +new Date(a.nextOccurrence) - +new Date(b.nextOccurrence));
  const monthlyEquivalent = Math.round(schedules.reduce((sum, item) => { if (!item.active || item.expectedAmountCents === null) return sum; const factor = item.cadence === "weekly" ? 52 / 12 : item.cadence === "monthly" ? 1 : item.cadence === "quarterly" ? 1 / 3 : 1 / 12; return sum + item.expectedAmountCents * factor; }, 0));
  type FeedItem = { key: string; when: number; month: string; kind: "bill"; bill: Bill } | { key: string; when: number; month: string; kind: "payment"; payment: Payment };
  const monthOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const items: FeedItem[] = [
    ...data.bills.map((bill) => ({ key: `bill:${bill.id}`, when: +new Date(bill.dueDate ?? bill.createdAt), month: bill.periodLabel, kind: "bill" as const, bill })),
    ...data.payments.map((payment) => ({ key: `payment:${payment.id}`, when: +new Date(payment.paidAt), month: monthOf(payment.paidAt), kind: "payment" as const, payment })),
  ].sort((a, b) => b.when - a.when);
  const groups: Array<{ month: string; items: FeedItem[] }> = [];
  for (const item of items) { const group = groups.find((entry) => entry.month === item.month); if (group) group.items.push(item); else groups.push({ month: item.month, items: [item] }); }
  const monthMeta = (group: { month: string; items: FeedItem[] }) => {
    const monthBills = group.items.filter((item) => item.kind === "bill").map((item) => (item as { bill: Bill }).bill);
    if (!monthBills.length) return { label: "payments" };
    return { label: `${money(monthBills.reduce((sum, bill) => sum + bill.amountCents, 0), currency)} recorded` };
  };
  // Splitwise-style permanent history: a bill row always shows your original share.
  const sideFor = (bill: Bill) => {
    const lent = (bill.obligations ?? []).filter((item) => item.creditorUserId === user.id).reduce((sum, item) => sum + item.amountCents, 0);
    const borrowed = (bill.obligations ?? []).filter((item) => item.debtorUserId === user.id).reduce((sum, item) => sum + item.amountCents, 0);
    if (borrowed > 0) return { label: "you borrowed", amount: money(borrowed, currency), tone: "borrowed" };
    if (lent > 0) return { label: "you lent", amount: money(lent, currency), tone: "lent" };
    return { label: "not involved", amount: "—", tone: "done" };
  };
  const firstName = (name?: string | null) => (name ?? "").split(/\s+/)[0] || "Someone";
  return <section className="page-content feed-view">
    <button className="feed-sched" onClick={() => setSchedOpen((value) => !value)} aria-expanded={schedOpen}>
      <RepeatDuotone size={17} weight="duotone" />
      <span className="feed-sched-text"><b>Scheduled</b><small>{schedules.length ? `${schedules.length} recurring${monthlyEquivalent > 0 ? ` · ≈ ${money(monthlyEquivalent, currency)} / mo` : ""}` : "no recurring bills yet"}</small></span>
      <span className="feed-chev">{schedOpen ? "⌄" : "›"}</span>
    </button>
    {schedOpen && schedules.map((item) => { const date = new Date(item.nextOccurrence); return <button className="bill-line sched" key={item.id} onClick={() => onEditRecurring(item)}>
      <span className="bill-when">{date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()} {date.getDate()}</span>
      <span className="bill-line-text"><strong>{item.name}</strong><small>{item.cadence} · splits {item.templateConfig.allocations.length} way{item.templateConfig.allocations.length === 1 ? "" : "s"}</small></span>
      <span className="bill-line-amt"><b>{item.expectedAmountCents === null ? "varies" : money(item.expectedAmountCents, currency)}</b><small>{item.active ? "RENEWS" : "PAUSED"}</small></span>
    </button>; })}
    {schedOpen && !schedules.length && <p className="empty-copy">Enable “repeats” while adding a bill to schedule it.</p>}
    {groups.map((group) => { const meta = monthMeta(group); return <div className="feed-month" key={group.month}>
      <div className="feed-month-head"><b>{group.month}</b><span>{meta.label}</span></div>
      {group.items.map((item) => {
        if (item.kind === "bill") {
          const bill = item.bill;
          const Icon = CATEGORY_ICONS[bill.category] ?? CATEGORY_ICONS.other;
          const side = sideFor(bill);
          const date = new Date(bill.dueDate ?? bill.createdAt);
          return <button className="feed-row" key={item.key} onClick={() => onBillDetail(bill.id)}>
            <span className="feed-date"><small>{date.toLocaleDateString(undefined, { month: "short" })}</small><b>{date.getDate()}</b></span>
            <Icon size={19} weight="duotone" className={`feed-glyph bill-cat cat-${bill.category}`} aria-hidden="true" />
            <span className="feed-main"><b>{bill.name}</b><small>{bill.payerUserId === user.id ? "You" : firstName(bill.payerName ?? bill.createdByName)} paid {money(bill.amountCents, currency)}{bill.amountState === "estimated" ? " · estimated" : ""}</small></span>
            <span className={`feed-side ${side.tone}`}><small>{side.label}</small><b>{side.amount}</b></span>
          </button>;
        }
        const payment = item.payment;
        const date = new Date(payment.paidAt);
        return <button className="feed-row pay" key={item.key} disabled={!payment.billId} onClick={() => payment.billId && onBillDetail(payment.billId)}>
          <span className="feed-date"><small>{date.toLocaleDateString(undefined, { month: "short" })}</small><b>{date.getDate()}</b></span>
          <HandCoins size={19} weight="duotone" className="feed-glyph glyph-pay" aria-hidden="true" />
          <span className="feed-main"><b>{payment.payerUserId === user.id ? "You" : firstName(payment.payerName)} paid {payment.recipientUserId === user.id ? "you" : firstName(payment.recipientName)}</b><small>{payment.billName ? `toward ${payment.billName}` : "payment"} · confirmed</small></span>
          <span className="feed-side pay"><b>{payment.recipientUserId === user.id ? "+" : ""}{money(payment.amountCents, currency)}</b></span>
        </button>;
      })}
    </div>; })}
    {!items.length && <p className="empty-copy">No bills yet. Add the first shared expense.</p>}
  </section>;
}

function Activity({ data, user, householdId, onBillDetail }: { data: HouseholdData; user: User; householdId: string; onBillDetail: (id: string) => void }) {
  const currency = data.household.currency;
  type Item = { id: string; billId?: string; when: string; title: string; detail: string; kind: "bill" | "payment" | "closure"; category?: BillCategory; toMe: boolean; settledShare: boolean; amountCents: number };
  const items: Item[] = [
    ...data.bills.map((bill) => ({ id: `bill:${bill.id}`, billId: bill.id, when: bill.createdAt, title: `${bill.name} added`, detail: `${bill.status === "settled" ? "Settled" : "Outstanding"} · ${CATEGORY_LABELS[bill.category] ?? CATEGORY_LABELS.other} · by ${bill.createdByName ?? "a household member"}`, kind: "bill" as const, category: bill.category, toMe: false, settledShare: false, amountCents: bill.amountCents })),
    ...data.payments.map((payment) => ({ id: `payment:${payment.id}`, billId: payment.billId ?? undefined, when: payment.paidAt, title: payment.note === "Marked settled" && payment.billName ? `${payment.payerName} settled their share of ${payment.billName}` : payment.billName ? `${payment.payerName} paid toward ${payment.billName}` : `${payment.payerName ?? "A member"} paid ${payment.recipientName ?? "another member"}`, detail: `to ${payment.recipientUserId === user.id ? "you" : payment.recipientName ?? "another member"} · confirmed by ${payment.actorName ?? "a household member"}`, kind: "payment" as const, toMe: payment.recipientUserId === user.id, settledShare: payment.note === "Marked settled", amountCents: payment.amountCents })),
    ...data.closures.map((closure) => ({ id: `closure:${closure.id}`, billId: closure.billId, when: closure.changedAt, title: `${closure.billName} closed without payment`, detail: `closed by ${closure.actorName}`, kind: "closure" as const, toMe: false, settledShare: false, amountCents: 0 })),
  ].sort((a, b) => +new Date(b.when) - +new Date(a.when));
  const [now] = useState(() => Date.now());
  const dayKey = (iso: string) => new Date(iso).toDateString();
  const todayKey = new Date(now).toDateString();
  const yesterdayKey = new Date(now - 86_400_000).toDateString();
  const groups: Array<{ key: string; items: Item[] }> = [];
  for (const item of items) { const key = dayKey(item.when); const group = groups[groups.length - 1]; if (group && group.key === key) group.items.push(item); else groups.push({ key, items: [item] }); }
  const daySummary = (dayItems: Item[]) => {
    const received = dayItems.reduce((sum, item) => sum + (item.kind === "payment" && item.toMe ? item.amountCents : 0), 0);
    if (received > 0) return `${money(received, currency)} confirmed`;
    const bills = dayItems.filter((item) => item.kind === "bill");
    if (bills.length) return `${bills.length} bill${bills.length === 1 ? "" : "s"} added · ${money(bills.reduce((sum, item) => sum + item.amountCents, 0), currency)}`;
    const payments = dayItems.filter((item) => item.kind === "payment");
    if (payments.length) return `${payments.length} payment${payments.length === 1 ? "" : "s"} confirmed`;
    return `${dayItems.length} closed`;
  };
  const timeLabel = (iso: string, key: string) => {
    if (key !== todayKey) return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const minutes = Math.max(Math.round((now - +new Date(iso)) / 60_000), 0);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  };
  return <section className="page-content activity-view">
    <div className="activity-toolbar"><p>Every bill, payment, and closure stays reviewable here.</p><a className="activity-export" href={`/api/households/${householdId}/export`} download><Download size={15} /> Export CSV</a></div>
    {groups.map((group) => { const first = new Date(group.items[0].when); return <div className="activity-day" key={group.key}>
      <div className="activity-day-head"><strong>{group.key === todayKey ? "Today" : group.key === yesterdayKey ? "Yesterday" : first.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong><small>{first.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</small><span className="activity-day-sum">{daySummary(group.items)}</span></div>
      {group.items.map((item) => { const Icon = item.kind === "bill" ? (CATEGORY_ICONS[item.category ?? "other"] ?? CATEGORY_ICONS.other) : item.kind === "closure" ? FileX : item.settledShare ? SealCheck : HandCoins; return <button className="activity-row" key={item.id} disabled={!item.billId} onClick={() => item.billId && onBillDetail(item.billId)}>
        <Icon size={21} weight="duotone" className={`activity-glyph ${item.kind === "bill" ? `bill-cat cat-${item.category ?? "other"}` : item.kind === "closure" ? "glyph-close" : "glyph-pay"}`} aria-hidden="true" />
        <span className="activity-text"><strong>{item.title}</strong><small>{item.detail}</small></span>
        <span className="activity-right"><b className={item.kind === "payment" && item.toMe ? "amt-in" : item.kind === "closure" ? "amt-close" : "amt-bill"}>{item.kind === "closure" ? "—" : `${item.kind === "payment" && item.toMe ? "+" : ""}${money(item.amountCents, currency)}`}</b><small>{timeLabel(item.when, group.key)}</small></span>
      </button>; })}
    </div>; })}
    {!items.length && <p className="empty-copy">Activity will appear here as bills, settlements, closures, and payments are recorded.</p>}
  </section>;
}

function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={close}><X size={20} /></button></div><div className="modal-body">{children}</div></section></div>; }

function BillModal({ data, currentUserId, initial, close, save }: { data: HouseholdData; currentUserId?: string; initial?: BillDetailData; close: () => void; save: (body: unknown, recurring?: unknown) => Promise<void> }) {
  const initialAllocations = Object.fromEntries((initial?.allocations ?? []).map((item) => [item.userId, initial?.bill.allocationMethod === "percentage" ? String((item.percentageBasisPoints ?? 0) / 100) : (item.amountCents / 100).toFixed(2)]));
  const defaultPayer = initial?.contributions[0]?.userId ?? data.members.find((member) => member.id === currentUserId)?.id ?? data.members[0]?.id ?? "";
  const [name, setName] = useState(initial?.bill.name ?? "");
  const [category, setCategory] = useState<BillCategory>(initial?.bill.category ?? "other");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial));
  const [amount, setAmount] = useState(initial ? (initial.bill.amountCents / 100).toFixed(2) : "");
  const [estimated, setEstimated] = useState(initial?.bill.amountState === "estimated");
  const [method, setMethod] = useState<"equal" | "percentage" | "fixed">((initial?.bill.allocationMethod as "equal" | "percentage" | "fixed") ?? "equal");
  const [payerId, setPayerId] = useState(defaultPayer);
  const [included, setIncluded] = useState<string[]>(initial ? initial.allocations.map((item) => item.userId) : data.members.map((member) => member.id));
  const [allocationValues, setAllocationValues] = useState<Record<string, string>>(initialAllocations);
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [cadence, setCadence] = useState<Recurring["cadence"]>("monthly");
  const [nextDate, setNextDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountCents = Math.round(Number(amount || 0) * 100);
  const includedMembers = data.members.filter((member) => included.includes(member.id));
  const guessCategory = (value: string): BillCategory | null => {
    const text = value.toLowerCase();
    const rules: Array<[RegExp, BillCategory]> = [[/rent|lease|mortgage/, "housing"], [/grocer|market|costco|aldi/, "groceries"], [/internet|wifi|electric|water|power|gas bill|utility|utilities|hydro/, "utilities"], [/takeout|dinner|lunch|pizza|sushi|thai|restaurant|coffee/, "dining"], [/uber|lyft|fuel|transit|parking|car /, "transport"], [/netflix|spotify|subscription|prime|icloud|hbo/, "subscriptions"], [/clean|supplies|paper towels|detergent|household/, "household"]];
    for (const [pattern, match] of rules) if (pattern.test(text)) return match;
    return null;
  };
  const suggestedCategory = guessCategory(name);
  function updateName(value: string) { setName(value); if (!categoryTouched) { const guess = guessCategory(value); if (guess) setCategory(guess); } }
  function toggleIncluded(memberId: string) { setIncluded((current) => current.includes(memberId) ? (current.length > 1 ? current.filter((id) => id !== memberId) : current) : [...current, memberId]); }
  const equalShares = (() => { const count = includedMembers.length || 1; const base = Math.floor(amountCents / count); let remainder = amountCents - base * count; return Object.fromEntries(includedMembers.map((member) => [member.id, base + (remainder-- > 0 ? 1 : 0)])); })();
  const allocationTotal = includedMembers.reduce((sum, member) => sum + Number(allocationValues[member.id] || 0), 0);
  const allocationTarget = method === "percentage" ? 100 : Number(amount || 0);
  const allocationRemaining = allocationTarget - allocationTotal;
  const allocationComplete = method === "equal" || Math.abs(allocationRemaining) < .001;
  const allocationProgress = method === "percentage"
    ? `${Math.abs(allocationRemaining).toFixed(2)}% ${allocationRemaining < 0 ? "over" : "remaining"}`
    : `${money(Math.round(Math.abs(allocationRemaining) * 100), data.household.currency)} ${allocationRemaining < 0 ? "over" : "remaining"}`;
  const consequence = (() => {
    if (!amountCents) return null;
    const shareFor = (memberId: string) => method === "equal" ? (equalShares[memberId] ?? 0) : method === "fixed" ? Math.round(Number(allocationValues[memberId] || 0) * 100) : Math.round(amountCents * Number(allocationValues[memberId] || 0) / 100);
    const debtors = includedMembers.filter((member) => member.id !== payerId).map((member) => ({ member, share: shareFor(member.id) })).filter((entry) => entry.share > 0);
    if (!debtors.length) return null;
    const payerName = payerId === currentUserId ? "you" : data.members.find((member) => member.id === payerId)?.displayName ?? "the payer";
    if (payerId === currentUserId) {
      const allEqual = debtors.every((entry) => entry.share === debtors[0].share);
      const names = debtors.map((entry) => entry.member.id === currentUserId ? "you" : entry.member.displayName);
      return allEqual ? `${names.join(" and ")} owe${names.length === 1 ? "s" : ""} you ${money(debtors[0].share, data.household.currency)}${debtors.length > 1 ? " each" : ""}` : `you're owed ${money(debtors.reduce((sum, entry) => sum + entry.share, 0), data.household.currency)}`;
    }
    const mine = debtors.find((entry) => entry.member.id === currentUserId);
    return mine ? `you owe ${payerName} ${money(mine.share, data.household.currency)}` : `${payerName} is owed ${money(debtors.reduce((sum, entry) => sum + entry.share, 0), data.household.currency)}`;
  })();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!amountCents) return;
    if (!payerId) { setError("Choose who paid the bill"); return; }
    if (!includedMembers.length) { setError("Include at least one person in the split"); return; }
    const contributions = [{ userId: payerId, amountCents }];
    let allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }>;
    if (method === "equal") allocations = includedMembers.map((member) => ({ userId: member.id, amountCents: equalShares[member.id] ?? 0 }));
    else if (method === "fixed") allocations = includedMembers.map((member) => ({ userId: member.id, amountCents: Math.round(Number(allocationValues[member.id] || 0) * 100) })).filter((item) => item.amountCents > 0);
    else { const basis = includedMembers.map((member) => ({ userId: member.id, percentageBasisPoints: Math.round(Number(allocationValues[member.id] || 0) * 100) })).filter((item) => item.percentageBasisPoints > 0); let allocated = 0; allocations = basis.map((item, index) => { const amountForMember = index === basis.length - 1 ? amountCents - allocated : Math.round(amountCents * item.percentageBasisPoints / 10_000); allocated += amountForMember; return { userId: item.userId, amountCents: amountForMember, percentageBasisPoints: item.percentageBasisPoints }; }); }
    if (makeRecurring && !nextDate) { setError("Choose the next occurrence date"); return; }
    const body = { name, category, amountCents, periodLabel: initial?.bill.periodLabel ?? new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }), dueDate: initial?.bill.dueDate ?? null, amountState: estimated ? "estimated" : "final", allocationMethod: method, contributions, allocations, ...(initial ? { revision: initial.bill.revision } : {}) };
    const recurring = makeRecurring ? { name, category, expectedAmountCents: amountCents, cadence, nextOccurrence: new Date(`${nextDate}T12:00:00Z`).toISOString(), allocationMethod: method, contributions, allocations, active: true } : undefined;
    setBusy(true); setError(""); try { await save(body, recurring); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save bill"); setBusy(false); }
  }
  return <Modal title={initial ? "Edit bill" : "Add a bill"} subtitle={data.household.name} close={close}><form className="abill" onSubmit={submit}>
    <div className="abill-amtrow">
      <label className="abill-amount"><span className="abill-cur">$</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus={!initial} required /></label>
      <div className="abill-est"><button type="button" className={estimated ? "" : "on"} onClick={() => setEstimated(false)}>Final</button><button type="button" className={estimated ? "on" : ""} onClick={() => setEstimated(true)}>Estimated</button></div>
    </div>
    <input className="abill-name" value={name} onChange={(e) => updateName(e.target.value)} placeholder="What was it? e.g. Groceries — week 29" required />
    <div className="abill-chips">{BILL_CATEGORIES.map((item) => { const Icon = CATEGORY_ICONS[item] ?? CATEGORY_ICONS.other; return <button type="button" key={item} className={`abill-chip${category === item ? " on" : suggestedCategory === item && !categoryTouched ? " sug" : ""}`} onClick={() => { setCategory(item); setCategoryTouched(true); }}><Icon size={14} weight="duotone" />{CATEGORY_LABELS[item]}</button>; })}</div>
    <span className="abill-lbl">PAID BY</span>
    <div className="abill-members">{data.members.map((member) => <button type="button" key={member.id} className={`abill-m${payerId === member.id ? " on" : ""}`} onClick={() => setPayerId(member.id)}><Avatar name={member.displayName} /><small>{member.id === currentUserId ? "You" : member.displayName.split(" ")[0]}</small></button>)}</div>
    <span className="abill-lbl">SPLIT BETWEEN · TAP TO INCLUDE{method === "equal" && includedMembers.length > 0 && amountCents > 0 ? ` · ${money(Math.floor(amountCents / includedMembers.length), data.household.currency)} EACH` : ""}</span>
    <div className="abill-members split">{data.members.map((member) => { const isIn = included.includes(member.id); return <span key={member.id} className={`abill-m${isIn ? " on" : " off"}`}>
      <button type="button" onClick={() => toggleIncluded(member.id)}><Avatar name={member.displayName} /></button>
      {isIn && method !== "equal" ? <input className="abill-share" inputMode="decimal" value={allocationValues[member.id] ?? ""} placeholder={method === "percentage" ? "%" : "0.00"} onChange={(e) => setAllocationValues({ ...allocationValues, [member.id]: e.target.value })} /> : <small>{isIn ? (amountCents ? money(equalShares[member.id] ?? 0, data.household.currency) : (member.id === currentUserId ? "You" : member.displayName.split(" ")[0])) : "out"}</small>}
    </span>; })}{method !== "equal" && <span className={`abill-progress${allocationComplete ? " ok" : ""}`}>{allocationComplete ? "✓ adds up" : allocationProgress}</span>}</div>
    <div className="abill-seg"><button type="button" className={method === "equal" ? "on" : ""} onClick={() => setMethod("equal")}>Equal</button><button type="button" className={method === "percentage" ? "on" : ""} onClick={() => setMethod("percentage")}>Percentage</button><button type="button" className={method === "fixed" ? "on" : ""} onClick={() => setMethod("fixed")}>Exact</button></div>
    {!initial && <div className="abill-extras">
      <span>Repeats</span><select value={makeRecurring ? cadence : "no"} onChange={(e) => { if (e.target.value === "no") setMakeRecurring(false); else { setMakeRecurring(true); setCadence(e.target.value as Recurring["cadence"]); } }}><option value="no">doesn&#39;t repeat</option><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="yearly">yearly</option></select>
      {makeRecurring && <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} aria-label="Next occurrence" />}
    </div>}
    {error && <p className="form-error">{error}</p>}
    <button className="abill-cta" disabled={busy || !allocationComplete}>{busy ? "Saving…" : `${initial ? "Save bill" : "Add bill"}${consequence ? ` — ${consequence}` : ""}`}</button>
  </form></Modal>;
}

function ClaimModal({ balance, existing, initialCents, currency, close, save }: { balance: Balance; existing?: Claim; initialCents?: number; currency: string; close: () => void; save: (body: { creditorUserId?: string; amountCents: number; note?: string }) => Promise<void> }) {
  const maxCents = balance.amountCents;
  const [amount, setAmount] = useState((Math.min(existing?.amountCents ?? initialCents ?? maxCents, maxCents) / 100).toFixed(2));
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountCents = Math.round(Number(amount || 0) * 100);
  const halfCents = Math.round(maxCents / 2);
  const chip = amountCents === maxCents ? "all" : amountCents === halfCents ? "half" : "custom";
  const overMax = amountCents > maxCents;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!amountCents || overMax) return;
    setBusy(true); setError("");
    try { await save({ ...(existing ? {} : { creditorUserId: balance.recipientUserId }), amountCents, ...(note.trim() ? { note: note.trim() } : {}) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The claim could not be sent"); setBusy(false); }
  }
  return <Modal title={`Settle up with ${balance.recipientName ?? "them"}`} subtitle={`Enter what you sent — the balance changes when ${balance.recipientName ?? "they"} confirms it arrived`} close={close}><form className="pm" onSubmit={submit}>
    <label className="pm-amount"><span>$</span><input type="number" inputMode="decimal" min="0.01" max={(maxCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></label>
    <div className="pm-chips"><button type="button" className={chip === "all" ? "on" : ""} onClick={() => setAmount((maxCents / 100).toFixed(2))}>All {money(maxCents, currency)}</button><button type="button" className={chip === "half" ? "on" : ""} onClick={() => setAmount((halfCents / 100).toFixed(2))}>Half</button><button type="button" className={chip === "custom" ? "on" : ""} onClick={() => setAmount("")}>Custom</button></div>
    {overMax && <p className="pm-conseq part">more than you owe — max {money(maxCents, currency)}</p>}
    <input className="pm-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional) — e.g. Venmo just now" />
    {error && <p className="form-error">{error}</p>}
    <button className="pm-cta" disabled={busy || !amountCents || overMax}>{busy ? "Sending…" : existing ? "Update claim" : "Mark as sent"}</button>
    <button type="button" className="pm-cancel" onClick={close}>Cancel</button>
  </form></Modal>; }

function PaymentModal({ data, currentUserId, specific, close, save }: { data: HouseholdData; currentUserId: string; specific: (Balance & { note?: string }) | null; close: () => void; save: (body: unknown) => Promise<void> }) {
  const choices = data.balances.filter((item) => item.recipientUserId === currentUserId);
  const initialIndex = specific ? Math.max(choices.findIndex((item) => item.payerUserId === specific.payerUserId), 0) : 0;
  const [index, setIndex] = useState(initialIndex);
  const balance = choices[index];
  const maxCents = balance?.amountCents ?? 0;
  const [amount, setAmount] = useState(maxCents ? ((specific ? Math.min(specific.amountCents, maxCents) : maxCents) / 100).toFixed(2) : "");
  const [note, setNote] = useState(specific?.note ?? "");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountCents = Math.round(Number(amount || 0) * 100);
  const payerLabel = balance?.payerName ?? "them";
  const halfCents = Math.round(maxCents / 2);
  const chip = amountCents === maxCents ? "all" : amountCents === halfCents ? "half" : "custom";
  const overMax = amountCents > maxCents;
  const consequence = !amountCents ? null
    : overMax ? { tone: "part", text: `more than ${payerLabel} owes — max ${money(maxCents, data.household.currency)}` }
    : amountCents === maxCents ? { tone: "full", text: `✓ settles everything ${payerLabel} owes you` }
    : { tone: "part", text: `leaves ${money(maxCents - amountCents, data.household.currency)} still open` };
  function pick(nextIndex: number) { setIndex(nextIndex); const next = choices[nextIndex]; setAmount(next ? (next.amountCents / 100).toFixed(2) : ""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!balance || !amountCents || overMax) return;
    setBusy(true); setError("");
    try { await save({ idempotencyKey, payerUserId: balance.payerUserId, recipientUserId: balance.recipientUserId, amountCents, note, paidAt: new Date().toISOString() }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm payment"); setBusy(false); }
  }
  return <Modal title="Confirm payment received" subtitle="Money you received toward your balance" close={close}>{balance ? <form className="pm" onSubmit={submit}>
    <span className="pm-lbl">WHO PAID YOU?</span>
    <div className="pm-pills">{choices.map((item, itemIndex) => <button type="button" key={`${item.payerUserId}:${item.recipientUserId}`} className={`pm-pill${index === itemIndex ? " on" : ""}`} onClick={() => pick(itemIndex)}><Avatar name={item.payerName ?? ""} /><small>{money(item.amountCents, data.household.currency)}</small></button>)}</div>
    <label className="pm-amount"><span>$</span><input type="number" inputMode="decimal" min="0.01" max={(maxCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></label>
    <div className="pm-chips"><button type="button" className={chip === "all" ? "on" : ""} onClick={() => setAmount((maxCents / 100).toFixed(2))}>All {money(maxCents, data.household.currency)}</button><button type="button" className={chip === "half" ? "on" : ""} onClick={() => setAmount((halfCents / 100).toFixed(2))}>Half</button><button type="button" className={chip === "custom" ? "on" : ""} onClick={() => setAmount("")}>Custom</button></div>
    {consequence && <p className={`pm-conseq ${consequence.tone}`}>{consequence.text}</p>}
    <input className="pm-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional) — e.g. Venmo 7/15" />
    {error && <p className="form-error">{error}</p>}
    <button className="pm-cta" disabled={busy || !amountCents || overMax}>{busy ? "Confirming…" : "Confirm received"}</button>
    <button type="button" className="pm-cancel" onClick={close}>Cancel</button>
  </form> : <p>You have no received payments to confirm.</p>}</Modal>; }

function InviteModal({ householdName, householdId, mutate, close }: { householdName: string; householdId: string; mutate: (path: string, method: string, body?: unknown) => Promise<Record<string, unknown>>; close: () => void }) {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch(`/api/households/${householdId}/invites`, { cache: "no-store" });
    if (response.ok) setInvites((await response.json()).invites as InviteItem[]);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/households/${householdId}/invites`, { cache: "no-store" }).then(async (response) => {
      if (!cancelled && response.ok) setInvites((await response.json()).invites as InviteItem[]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [householdId]);
  async function create() {
    setBusy(true); setError(""); setCopied(false);
    try {
      const result = await mutate(`/api/households/${householdId}/invites`, "POST") as { invite: { path: string } };
      setLink(`${location.origin}${result.invite.path}`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The invite could not be created"); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError("Copy the link manually — clipboard access was blocked."); }
  }
  async function revoke(id: string) {
    setError("");
    try { await mutate(`/api/households/${householdId}/invites/${id}`, "DELETE"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The invite could not be revoked"); }
  }
  return <Modal title="Invite a roommate" subtitle={`Share a single-use join link for ${householdName}`} close={close}>
    <p className="invite-copy">Anyone with the link can create a member account (or sign in) and join this Household. Each link works once and expires after 7 days.</p>
    {link ? <div className="invite-link-row"><input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" /><button className="secondary-button" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button></div> : null}
    <button className="primary-button invite-create" disabled={busy} onClick={create}><UserPlus size={16} /> {busy ? "Creating…" : link ? "Create another link" : "Create invite link"}</button>
    {invites.length > 0 && <section className="preference-section invite-list"><div><h3>Active invites</h3><p>Links that have not been used, revoked, or expired. The link itself is only shown when it is created.</p></div>{invites.map((item) => <div className="invite-row" key={item.id}><span><strong>Created by {item.createdByName}</strong><small>Expires {new Date(item.expiresAt).toLocaleDateString()}</small></span><button className="secondary-button" onClick={() => void revoke(item.id)}>Revoke</button></div>)}</section>}
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button className="primary-button" onClick={close}>Done</button></div>
  </Modal>;
}

function BillDetailModal({ detail, userId, currency, claims, canClaim, onClaim, close, edit, remove, addComment, uploadAttachment, removeAttachment, attachmentHref }: { detail: BillDetailData; userId: string; currency: string; claims: Claim[]; canClaim: (item: BillDetailData["obligations"][number]) => boolean; onClaim: (item: BillDetailData["obligations"][number]) => void; close: () => void; edit: () => void; remove: () => Promise<void>; addComment: (body: string) => Promise<void>; uploadAttachment: (file: File) => Promise<void>; removeAttachment: (attachmentId: string) => Promise<void>; attachmentHref: (attachmentId: string) => string }) {
  const [comment, setComment] = useState("");
  const [workError, setWorkError] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    setCommentBusy(true); setWorkError("");
    try { await addComment(comment.trim()); setComment(""); } catch (cause) { setWorkError(cause instanceof Error ? cause.message : "The comment could not be posted"); }
    finally { setCommentBusy(false); }
  }
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadBusy(true); setWorkError("");
    try { await uploadAttachment(file); } catch (cause) { setWorkError(cause instanceof Error ? cause.message : "The attachment could not be uploaded"); }
    finally { setUploadBusy(false); }
  }
  const Glyph = CATEGORY_ICONS[detail.bill.category] ?? CATEGORY_ICONS.other;
  return <Modal title={detail.bill.name} subtitle={`${detail.bill.periodLabel} · ${CATEGORY_LABELS[detail.bill.category] ?? CATEGORY_LABELS.other} · ${detail.bill.amountState}`} close={close}>
    <div className="bd">
      <div className="bd-head"><span className="bd-glyph"><Glyph size={24} weight="duotone" className={`bill-cat cat-${detail.bill.category}`} /></span><span className="bd-amt"><b>{money(detail.bill.amountCents, currency)}</b><small>TOTAL</small></span></div>

      <div className="bd-band">
        <div className="bd-bh"><strong>People</strong><small>{detail.contributions.map((item) => item.displayName).join(", ")} paid · {detail.bill.allocationMethod} split</small></div>
        {detail.contributions.map((item) => { const share = detail.allocations.find((allocation) => allocation.userId === item.userId); return <div className="bd-row" key={item.id}><Avatar name={item.displayName} /><span className="bd-t"><b>{item.userId === userId ? "You" : item.displayName}</b><small>paid {money(item.amountCents, currency)}{share ? ` · own share ${money(share.amountCents, currency)} covered` : ""}</small></span><span className="bd-ramt done">✓</span></div>; })}
        {detail.obligations.map((item) => <div className="bd-row" key={item.id}>
          <Avatar name={item.debtorName} />
          <span className="bd-t"><b>{item.debtorUserId === userId ? "You" : item.debtorName}</b><small>{item.debtorUserId === userId ? `your share — you owe ${item.creditorUserId === userId ? "yourself" : item.creditorName}` : `their share — owe${item.debtorUserId === userId ? "" : "s"} ${item.creditorUserId === userId ? "you" : item.creditorName}`}</small></span>
          <span className="bd-ramt">{money(item.originalAmountCents, currency)}</span>
          {item.debtorUserId === userId && canClaim(item) && !claims.some((claim) => claim.debtorUserId === userId && claim.creditorUserId === item.creditorUserId) ? <button className="bd-confirm" onClick={() => onClaim(item)}>I paid this</button> : null}
        </div>)}
        {!detail.obligations.length && <p className="empty-copy">No repayments are required for this expense.</p>}
      </div>

      <div className="bd-band">
        <div className="bd-bh"><strong>Receipts & comments</strong></div>
        {detail.attachments.map((item) => <div className="bd-file" key={item.id}><Paperclip size={14} /><a href={attachmentHref(item.id)} target="_blank" rel="noreferrer"><b>{item.fileName}</b><small>{(item.sizeBytes / 1024).toFixed(0)} KB · {item.uploadedByName} · {new Date(item.createdAt).toLocaleDateString()}</small></a><button className="icon-button" aria-label={`Remove ${item.fileName}`} onClick={() => { if (confirm("Remove this attachment? The removal stays in the bill history.")) void removeAttachment(item.id).catch((cause) => setWorkError(cause instanceof Error ? cause.message : "The attachment could not be removed")); }}><Trash2 size={14} /></button></div>)}
        <label className={`bd-attach${uploadBusy ? " busy" : ""}`}><Paperclip size={14} /> {uploadBusy ? "Uploading…" : "Attach a receipt"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" hidden disabled={uploadBusy} onChange={chooseFile} /></label>
        {detail.comments.map((item) => <div className="bd-comment" key={item.id}><Avatar name={item.authorName} /><span><b>{item.authorName}</b> <time>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time><p>{item.body}</p></span></div>)}
        <form className="bd-cinput" onSubmit={submitComment}><input value={comment} maxLength={1000} placeholder="Write a comment…" onChange={(e) => setComment(e.target.value)} /><button disabled={commentBusy || !comment.trim()}>{commentBusy ? "…" : "Post"}</button></form>
      </div>

      {workError && <p className="form-error">{workError}</p>}
      <button type="button" className="bd-disclose" onClick={() => setHistoryOpen((value) => !value)}>History ({detail.history.length}) <b>{historyOpen ? "Hide" : "Show"}</b></button>
      {historyOpen && <div className="bd-history">{detail.history.map((item) => <div key={item.id}><b>{item.changeType.replaceAll("_", " ")}</b><small>{item.changedBy} · {new Date(item.changedAt).toLocaleString()}</small></div>)}</div>}
      <div className="bd-foot"><button className="bd-txt" onClick={edit}>Edit terms</button><button className="bd-txt danger" onClick={() => void remove()}>Remove</button><button className="bd-done" onClick={close}>Done</button></div>
    </div>
  </Modal>; }

function RecurringModal({ data, initial, close, save, remove }: { data: HouseholdData; initial: Recurring; close: () => void; save: (body: unknown) => Promise<void>; remove: () => Promise<void> }) {
  const currency = data.household.currency;
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState<BillCategory>(initial.category);
  const [amount, setAmount] = useState(initial.expectedAmountCents ? (initial.expectedAmountCents / 100).toFixed(2) : "");
  const [payerId, setPayerId] = useState(initial.templateConfig.contributions[0]?.userId ?? data.members[0]?.id ?? "");
  const [included, setIncluded] = useState<string[]>(initial.templateConfig.allocations.map((item) => item.userId));
  const [method, setMethod] = useState<"equal" | "percentage" | "fixed">(initial.allocationMethod);
  const [allocationValues, setAllocationValues] = useState<Record<string, string>>(Object.fromEntries(initial.templateConfig.allocations.map((item) => [item.userId, initial.allocationMethod === "percentage" ? String((item.percentageBasisPoints ?? 0) / 100) : (item.amountCents / 100).toFixed(2)])));
  const [cadence, setCadence] = useState<Recurring["cadence"]>(initial.cadence);
  const [nextDate, setNextDate] = useState(new Date(initial.nextOccurrence).toISOString().slice(0, 10));
  const [active, setActive] = useState(initial.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountCents = Math.round(Number(amount || 0) * 100);
  const includedMembers = data.members.filter((member) => included.includes(member.id));
  function toggleIncluded(memberId: string) { setIncluded((current) => current.includes(memberId) ? (current.length > 1 ? current.filter((id) => id !== memberId) : current) : [...current, memberId]); }
  const equalShares = (() => { const count = includedMembers.length || 1; const base = Math.floor(amountCents / count); let remainder = amountCents - base * count; return Object.fromEntries(includedMembers.map((member) => [member.id, base + (remainder-- > 0 ? 1 : 0)])); })();
  const allocationTotal = includedMembers.reduce((sum, member) => sum + Number(allocationValues[member.id] || 0), 0);
  const allocationTarget = method === "percentage" ? 100 : Number(amount || 0);
  const allocationRemaining = allocationTarget - allocationTotal;
  const allocationComplete = method === "equal" || Math.abs(allocationRemaining) < .001;
  const allocationProgress = method === "percentage"
    ? `${Math.abs(allocationRemaining).toFixed(2)}% ${allocationRemaining < 0 ? "over" : "remaining"}`
    : `${money(Math.round(Math.abs(allocationRemaining) * 100), currency)} ${allocationRemaining < 0 ? "over" : "remaining"}`;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!amountCents) return;
    if (!includedMembers.length) { setError("Include at least one person in the split"); return; }
    const contributions = [{ userId: payerId, amountCents }];
    let allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }>;
    if (method === "equal") allocations = includedMembers.map((member) => ({ userId: member.id, amountCents: equalShares[member.id] ?? 0 }));
    else if (method === "fixed") allocations = includedMembers.map((member) => ({ userId: member.id, amountCents: Math.round(Number(allocationValues[member.id] || 0) * 100) })).filter((item) => item.amountCents > 0);
    else { const basis = includedMembers.map((member) => ({ userId: member.id, percentageBasisPoints: Math.round(Number(allocationValues[member.id] || 0) * 100) })).filter((item) => item.percentageBasisPoints > 0); let allocated = 0; allocations = basis.map((item, index) => { const amountForMember = index === basis.length - 1 ? amountCents - allocated : Math.round(amountCents * item.percentageBasisPoints / 10_000); allocated += amountForMember; return { userId: item.userId, amountCents: amountForMember, percentageBasisPoints: item.percentageBasisPoints }; }); }
    setBusy(true); setError("");
    try { await save({ name, category, expectedAmountCents: amountCents, cadence, nextOccurrence: new Date(`${nextDate}T12:00:00Z`).toISOString(), allocationMethod: method, contributions, allocations, active }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save schedule"); setBusy(false); }
  }
  return <Modal title="Edit future schedule" subtitle="Past bills never change" close={close}><form className="abill" onSubmit={submit}>
    <div className="abill-amtrow"><label className="abill-amount"><span className="abill-cur">$</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></label></div>
    <input className="abill-name" value={name} onChange={(e) => setName(e.target.value)} required />
    <div className="abill-chips">{BILL_CATEGORIES.map((item) => { const Icon = CATEGORY_ICONS[item] ?? CATEGORY_ICONS.other; return <button type="button" key={item} className={`abill-chip${category === item ? " on" : ""}`} onClick={() => setCategory(item)}><Icon size={14} weight="duotone" />{CATEGORY_LABELS[item]}</button>; })}</div>
    <span className="abill-lbl">PAID BY</span>
    <div className="abill-members">{data.members.map((member) => <button type="button" key={member.id} className={`abill-m${payerId === member.id ? " on" : ""}`} onClick={() => setPayerId(member.id)}><Avatar name={member.displayName} /><small>{member.displayName.split(" ")[0]}</small></button>)}</div>
    <span className="abill-lbl">SPLIT BETWEEN · TAP TO INCLUDE{method === "equal" && includedMembers.length > 0 && amountCents > 0 ? ` · ${money(Math.floor(amountCents / includedMembers.length), currency)} EACH` : ""}</span>
    <div className="abill-members split">{data.members.map((member) => { const isIn = included.includes(member.id); return <span key={member.id} className={`abill-m${isIn ? " on" : " off"}`}>
      <button type="button" onClick={() => toggleIncluded(member.id)}><Avatar name={member.displayName} /></button>
      {isIn && method !== "equal" ? <input className="abill-share" inputMode="decimal" value={allocationValues[member.id] ?? ""} placeholder={method === "percentage" ? "%" : "0.00"} onChange={(e) => setAllocationValues({ ...allocationValues, [member.id]: e.target.value })} /> : <small>{isIn ? (amountCents ? money(equalShares[member.id] ?? 0, currency) : member.displayName.split(" ")[0]) : "out"}</small>}
    </span>; })}{method !== "equal" && <span className={`abill-progress${allocationComplete ? " ok" : ""}`}>{allocationComplete ? "✓ adds up" : allocationProgress}</span>}</div>
    <div className="abill-seg"><button type="button" className={method === "equal" ? "on" : ""} onClick={() => setMethod("equal")}>Equal</button><button type="button" className={method === "percentage" ? "on" : ""} onClick={() => setMethod("percentage")}>Percentage</button><button type="button" className={method === "fixed" ? "on" : ""} onClick={() => setMethod("fixed")}>Exact</button></div>
    <div className="abill-extras">
      <span>Repeats</span><select value={cadence} onChange={(e) => setCadence(e.target.value as Recurring["cadence"])}><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="yearly">yearly</option></select>
      <span>next</span><input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
    </div>
    <label className="abill-active"><span><strong>Schedule active</strong><small>Pause future generation without changing history</small></span><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /></label>
    {error && <p className="form-error">{error}</p>}
    <div className="abill-foot"><button type="button" className="abill-danger" onClick={() => void remove()}>Delete schedule</button><button type="button" className="abill-cancel" onClick={close}>Cancel</button><button className="abill-cta save" disabled={busy || !allocationComplete || !name || !amountCents || !nextDate}>{busy ? "Saving…" : "Save schedule"}</button></div>
  </form></Modal>;
}

function EmptyAccount({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) { return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div><span className="setup-icon"><WalletCards size={24} /></span><h1>No Household assigned</h1><p>Hello {user.displayName}. An administrator needs to add your account to a Household before financial data is available.</p><a className="secondary-button" href="/settings">User settings</a><button className="secondary-button" onClick={onLogout}>Sign out</button></section></main>; }
