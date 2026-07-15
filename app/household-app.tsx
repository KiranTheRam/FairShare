"use client";

import { ArrowDownLeft, ArrowRight, Bell, BellRing, Check, Copy, CreditCard, Download, FileText, LayoutDashboard, Menu, MessageSquare, Paperclip, Plus, ReceiptText, Settings, Trash2, UserPlus, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Basket, Car, ForkKnife, House as HouseDuotone, Lightbulb as LightbulbDuotone, Package as PackageDuotone, Repeat as RepeatDuotone, Shapes as ShapesDuotone, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { BILL_CATEGORIES, CATEGORY_LABELS, type BillCategory } from "@/lib/categories";
import { isThemeId } from "@/lib/themes";

type Tab = "overview" | "bills" | "balances" | "activity";
type ModalName = "bill" | "edit" | "payment" | "recurring-edit" | "detail" | "invite" | null;
type User = { id: string; email: string; displayName: string; role: "member" | "administrator" };
type HouseholdListItem = { id: string; name: string; currency: string };
type Member = { id: string; displayName: string; email: string };
type Bill = { id: string; name: string; category: BillCategory; amountCents: number; periodLabel: string; dueDate?: string | null; amountState: "estimated" | "final"; status: "draft" | "open" | "settled" | "void"; createdByName?: string; createdAt: string };
type BalanceComponent = { billId: string; billName: string; category: BillCategory; amountCents: number };
type Balance = { payerUserId: string; recipientUserId: string; payerName?: string; recipientName?: string; amountCents: number; components?: BalanceComponent[] };
type Payment = { id: string; billId?: string | null; payerUserId: string; recipientUserId: string; payerName?: string; recipientName?: string; actorName?: string; billName?: string | null; amountCents: number; note?: string | null; paidAt: string };
type Closure = { id: string; billId: string; billName: string; actorName: string; changedAt: string };
type Recurring = { id: string; name: string; category: BillCategory; expectedAmountCents: number | null; cadence: "weekly" | "monthly" | "quarterly" | "yearly"; nextOccurrence: string; allocationMethod: "equal" | "percentage" | "fixed"; templateConfig: { contributions: Array<{ userId: string; amountCents: number }>; allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }> }; active: boolean };
type HouseholdData = { household: HouseholdListItem & { timezone: string }; members: Member[]; bills: Bill[]; balances: Balance[]; simplifiedBalances: Balance[]; payments: Payment[]; closures: Closure[]; recurring: Recurring[] };
type SessionData = { user: User; csrfToken: string; households: HouseholdListItem[] };
type NotificationItem = { id: string; title: string; body: string; readAt: string | null; createdAt: string };
type BillComment = { id: string; authorUserId: string; authorName: string; body: string; createdAt: string };
type BillAttachment = { id: string; fileName: string; contentType: string; sizeBytes: number; uploadedByUserId: string; uploadedByName: string; createdAt: string };
type InviteItem = { id: string; createdByName: string; expiresAt: string; createdAt: string };
type BillDetailData = { bill: Bill & { revision: number; allocationMethod: string }; contributions: Array<{ id: string; userId: string; displayName: string; amountCents: number; paidAt: string }>; allocations: Array<{ id: string; userId: string; displayName: string; amountCents: number; percentageBasisPoints: number | null }>; obligations: Array<{ id: string; debtorUserId: string; creditorUserId: string; debtorName: string; creditorName: string; originalAmountCents: number; paidAmountCents: number; outstandingAmountCents: number }>; payments: Payment[]; history: Array<{ id: string; changeType: string; changedBy: string; changedAt: string }>; comments: BillComment[]; attachments: BillAttachment[] };

const money = (cents: number, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export function HouseholdApp() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [householdId, setHouseholdId] = useState("");
  const [data, setData] = useState<HouseholdData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<ModalName>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [billDetail, setBillDetail] = useState<BillDetailData | null>(null);
  const [paymentContext, setPaymentContext] = useState<(Balance & { billId: string }) | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<Recurring | null>(null);

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

  // refresh is intentionally keyed only by the selected Household.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (householdId) void refresh(); }, [householdId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const [response, recurringResponse] = await Promise.all([fetch(`/api/households/${householdId}`, { cache: "no-store" }), fetch(`/api/households/${householdId}/recurring`, { cache: "no-store" })]);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load household");
      const recurringBody = recurringResponse.ok ? await recurringResponse.json() : { recurring: [] };
      setData({ ...body, recurring: recurringBody.recurring }); localStorage.setItem("fairshare-household", householdId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load household"); }
    finally { setLoading(false); }
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
    const response = await fetch(`/api/households/${householdId}/bills/${billId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setToast(body.error ?? "Bill detail could not be loaded"); return; }
    setBillDetail(body); setModal("detail");
  }

  function openPayment(context: (Balance & { billId: string }) | null = null) { setPaymentContext(context); setModal("payment"); }

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

  const myBalances = useMemo(() => data?.balances.filter((item) => item.payerUserId === session?.user.id || item.recipientUserId === session?.user.id) ?? [], [data, session]);
  const receivableBalances = useMemo(() => data?.balances.filter((item) => item.recipientUserId === session?.user.id) ?? [], [data, session]);
  const net = myBalances.reduce((sum, item) => sum + (item.recipientUserId === session?.user.id ? item.amountCents : -item.amountCents), 0);
  const title = tab === "overview" ? `Hello, ${session?.user.displayName.split(" ")[0] ?? "there"}` : tab[0].toUpperCase() + tab.slice(1);

  if (loading && !session) return <main className="loading-screen"><span className="brand-mark"><span className="roof" /><span className="door" /></span><p>Loading FairShare…</p></main>;
  if (session && !session.households.length) return <EmptyAccount user={session.user} onLogout={logout} />;

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div>
      <label className="household-switcher"><span className="house-avatar">{initials(data?.household.name ?? "House")}</span><span><small>Household</small><strong>{data?.household.name ?? "Loading…"}</strong></span>
        <select aria-label="Choose household" value={householdId} onChange={(e) => setHouseholdId(e.target.value)}>{session?.households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select>
      </label>
      <nav className="side-nav">{(["overview", "bills", "balances", "activity"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => { setTab(item); setSidebarOpen(false); }}>{item === "overview" ? <LayoutDashboard size={19} /> : item === "bills" ? <ReceiptText size={19} /> : item === "balances" ? <WalletCards size={19} /> : <FileText size={19} />}<span>{item[0].toUpperCase() + item.slice(1)}</span></button>)}</nav>
      <div className="side-bottom"><a className="side-link" href="/settings"><Settings size={19} /> User settings</a><a className="profile-card" href="/settings"><Avatar name={session?.user.displayName ?? ""} /><span><strong>{session?.user.displayName}</strong><small>{session?.user.email}</small></span></a></div>
    </aside>
    {sidebarOpen && <button className="scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <main className="main"><header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button><div className="top-actions"><button className="install-pill" onClick={install}><ArrowDownLeft size={16} /> Install app</button><button className="icon-button notification-button" onClick={openNotifications} aria-label="Notifications"><Bell size={20} />{notifications.some((item) => !item.readAt) && <span className="unread-dot" />}</button><a className="icon-button" href="/settings" aria-label="User settings"><Settings size={20} /></a><Avatar name={session?.user.displayName ?? ""} /></div>
      {notificationsOpen && <div className="notification-panel"><div className="panel-title"><strong>Notifications</strong><span>{notifications.filter((item) => !item.readAt).length} new</span></div>{notifications.length ? notifications.slice(0, 8).map((item) => <button key={item.id}><span className="activity-icon mint"><Bell size={17} /></span><span><strong>{item.title}</strong><small>{item.body}</small></span></button>) : <p className="panel-empty">You’re all caught up.</p>}</div>}
    </header>
    <div className="content-wrap"><div className="page-heading"><div><p className="eyebrow">{data?.household.name.toUpperCase()} · {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase()}</p><div className="page-title-row"><h1>{title}</h1>{tab === "overview" && <button className="activity-link-button" onClick={() => setTab("activity")}><FileText size={16} /> Activity</button>}</div><p>{tab === "overview" ? "Here’s where everyone stands today." : tab === "bills" ? "Outstanding, settled, and scheduled household expenses." : tab === "balances" ? "Open person-to-person obligations after repayments." : "Recent bills, settlements, closures, and payments."}</p></div>{tab !== "overview" && <div className="heading-actions"><button className="secondary-button" disabled={!receivableBalances.length} onClick={() => openPayment()}><ArrowRight size={17} /> Confirm payment</button><button className="primary-button" onClick={() => setModal("bill")}><Plus size={18} /> Add bill</button></div>}</div>
      {error && <div className="error-banner">{error}<button onClick={refresh}>Try again</button></div>}
      {loading ? <div className="wide-card loading-card">Refreshing ledger…</div> : tab === "overview" ? <Overview data={data!} user={session!.user} net={net} onBill={() => setModal("bill")} onPayment={() => openPayment()} onNudge={sendNudge} onBillDetail={openBill} onOpenBills={() => setTab("bills")} /> : tab === "bills" ? <Bills data={data!} onBillDetail={openBill} onEditRecurring={(item) => { setSelectedRecurring(item); setModal("recurring-edit"); }} /> : tab === "balances" ? <Balances data={data!} user={session!.user} onPayment={() => openPayment()} onNudge={sendNudge} onInvite={() => setModal("invite")} /> : <Activity data={data!} householdId={householdId} onBillDetail={openBill} />}
    </div></main>
    <nav className="bottom-nav">{(["overview", "bills"] as Tab[]).map((item) => <MobileNav key={item} item={item} tab={tab} setTab={setTab} />)}<button className="fab" onClick={() => setModal("bill")}><Plus size={24} /></button>{(["balances", "activity"] as Tab[]).map((item) => <MobileNav key={item} item={item} tab={tab} setTab={setTab} />)}</nav>
    {modal === "bill" && data && <BillModal data={data} currentUserId={session?.user.id} close={() => setModal(null)} save={async (body, recurring) => { await mutate(`/api/households/${householdId}/bills`, "POST", { ...(body as object), ...(recurring ? { recurring } : {}) }); setModal(null); setToast(recurring ? "Bill and recurring schedule added." : "Bill added to the household ledger."); await refresh(); }} />}
    {modal === "edit" && data && billDetail && <BillModal data={data} currentUserId={session?.user.id} initial={billDetail} close={() => setModal("detail")} save={async (body) => { await mutate(`/api/households/${householdId}/bills/${billDetail.bill.id}`, "PATCH", body); setModal(null); setToast("Bill updated and balances recalculated."); await refresh(); }} />}
    {modal === "payment" && data && <PaymentModal data={data} currentUserId={session?.user.id ?? ""} specific={paymentContext} close={() => { setModal(null); setPaymentContext(null); }} save={async (body) => { await mutate(`/api/households/${householdId}/payments`, "POST", body); setModal(null); setPaymentContext(null); setToast("Payment confirmed."); await refresh(); }} />}
    {modal === "recurring-edit" && data && selectedRecurring && <RecurringModal data={data} initial={selectedRecurring} close={() => setModal(null)} save={async (body) => { await mutate(`/api/households/${householdId}/recurring/${selectedRecurring.id}`, "PATCH", body); setModal(null); setSelectedRecurring(null); setToast("Future recurring bills will use the updated schedule."); await refresh(); }} />}
    {modal === "invite" && data && <InviteModal householdName={data.household.name} householdId={householdId} mutate={mutate} close={() => setModal(null)} />}
    {modal === "detail" && billDetail && <BillDetailModal detail={billDetail} userId={session?.user.id ?? ""} currency={data?.household.currency ?? "USD"} addComment={(body) => addComment(billDetail.bill.id, body)} uploadAttachment={(file) => uploadAttachment(billDetail.bill.id, file)} removeAttachment={(attachmentId) => removeAttachment(billDetail.bill.id, attachmentId)} attachmentHref={(attachmentId) => `/api/households/${householdId}/bills/${billDetail.bill.id}/attachments/${attachmentId}`} close={() => setModal(null)} edit={() => setModal("edit")} remove={async () => { if (!confirm("Remove this bill and recalculate Household balances? The audit record is retained.")) return; try { await mutate(`/api/households/${householdId}/bills/${billDetail.bill.id}`, "DELETE"); setModal(null); setToast("Bill removed and balances recalculated."); await refresh(); } catch (cause) { setToast(cause instanceof Error ? cause.message : "Bill could not be removed"); } }} record={(item) => openPayment({ billId: billDetail.bill.id, payerUserId: item.debtorUserId, recipientUserId: item.creditorUserId, payerName: item.debtorName, recipientName: item.creditorName, amountCents: item.outstandingAmountCents })} settle={async (item) => { if (!confirm(`Confirm receipt of ${money(item.outstandingAmountCents, data?.household.currency ?? "USD")} from ${item.debtorName} and mark this share settled?`)) return; try { await mutate(`/api/households/${householdId}/payments`, "POST", { idempotencyKey: crypto.randomUUID(), billId: billDetail.bill.id, payerUserId: item.debtorUserId, recipientUserId: item.creditorUserId, amountCents: item.outstandingAmountCents, note: "Marked settled", paidAt: new Date().toISOString() }); setToast(`${item.debtorName}’s share was settled.`); await refresh(); await openBill(billDetail.bill.id); } catch (cause) { setToast(cause instanceof Error ? cause.message : "Share could not be settled"); } }} closeWithoutPayment={async () => { if (!confirm("Close this entire expense without recording payments? Use this only when settlement was recorded separately.")) return; try { await mutate(`/api/households/${householdId}/bills/${billDetail.bill.id}/close`, "POST"); setModal(null); setToast("Expense closed without recording another payment."); await refresh(); } catch (cause) { setToast(cause instanceof Error ? cause.message : "Expense could not be closed"); } }} />}
    {toast && <div className="toast"><span><Check size={16} /></span>{toast}</div>}
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

function CategoryIcon({ category, settled }: { category: BillCategory; settled: boolean }) {
  const Icon = CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other;
  return <span className={`activity-icon category-icon ${settled ? "mint" : `category-${category}`}`} title={CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other}><Icon size={18} weight="duotone" aria-hidden="true" /></span>;
}
function MobileNav({ item, tab, setTab }: { item: Tab; tab: Tab; setTab: (value: Tab) => void }) { const Icon = item === "overview" ? LayoutDashboard : item === "bills" ? ReceiptText : item === "balances" ? WalletCards : FileText; return <button className={tab === item ? "active" : ""} onClick={() => setTab(item)}><Icon size={21} /><small>{item === "overview" ? "Home" : item[0].toUpperCase() + item.slice(1)}</small></button>; }

function BalanceCard({ item, currency, mine, direction, onOpen, onConfirm, onNudge, onBillDetail }: { item: Balance; currency: string; mine: boolean; direction: "in" | "out" | "other"; onOpen: () => void; onConfirm: () => void; onNudge: (item: Balance) => void; onBillDetail: (id: string) => void }) {
  const components = item.components ?? [];
  const title = direction === "in" ? item.payerName : direction === "out" ? `You owe ${item.recipientName}` : `${item.payerName} → ${item.recipientName}`;
  return <section className={`glance-card glance-tappable${mine ? "" : " glance-other"}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) onOpen(); }}>
    <div className="glance-card-top">{direction === "other" ? <div className="avatar-pair"><Avatar name={item.payerName ?? ""} /><Avatar name={item.recipientName ?? ""} /></div> : <Avatar name={(direction === "in" ? item.payerName : item.recipientName) ?? ""} />}<span className="glance-who"><strong>{title}</strong><small>{direction === "out" ? "Awaiting their confirmation" : `${components.length || "No"} bill${components.length === 1 ? "" : "s"} open`}</small></span><span className="glance-amt">{money(item.amountCents, currency)}</span></div>
    {components.length > 0 && <div className="glance-breakdown">{components.map((component) => <i key={component.billId} className={`glance-seg category-${component.category}`} style={{ width: `${Math.max((component.amountCents / item.amountCents) * 100, 3)}%` }} title={`${component.billName} — ${money(component.amountCents, currency)}`} />)}</div>}
    {components.length > 0 && <div className="glance-keys">{components.map((component) => <button key={component.billId} onClick={(event) => { event.stopPropagation(); onBillDetail(component.billId); }}><i className={`category-${component.category}`} />{component.billName} <b>{money(component.amountCents, currency)}</b></button>)}</div>}
    {direction === "in" && <div className="glance-actions"><button className="glance-confirm" onClick={(event) => { event.stopPropagation(); onConfirm(); }}>Confirm payment</button><button className="glance-remind" onClick={(event) => { event.stopPropagation(); void onNudge(item); }}><BellRing size={14} /> Remind</button></div>}
  </section>;
}

function Overview({ data, user, net, onBill, onPayment, onNudge, onBillDetail, onOpenBills }: { data: HouseholdData; user: User; net: number; onBill: () => void; onPayment: () => void; onNudge: (item: Balance) => void; onBillDetail: (id: string) => void; onOpenBills: () => void }) {
  const currency = data.household.currency;
  const owedToMe = data.balances.filter((item) => item.recipientUserId === user.id);
  const iOwe = data.balances.filter((item) => item.payerUserId === user.id);
  const others = data.balances.filter((item) => item.payerUserId !== user.id && item.recipientUserId !== user.id);
  const openBillCount = data.bills.filter((bill) => bill.status === "open").length;
  const debtorNames = owedToMe.map((item) => item.payerName).filter(Boolean);
  const [dayAgo] = useState(() => Date.now() - 86_400_000);
  const recentReceipts = data.payments.filter((payment) => payment.recipientUserId === user.id && new Date(payment.paidAt).getTime() > dayAgo);
  const receiptTotal = recentReceipts.reduce((sum, payment) => sum + payment.amountCents, 0);
  const latestReceipt = recentReceipts[0];
  const nextRecurring = data.recurring.filter((item) => item.active).sort((a, b) => +new Date(a.nextOccurrence) - +new Date(b.nextOccurrence))[0];
  const nextDue = nextRecurring ? new Date(nextRecurring.nextOccurrence) : null;
  return <div className="glance-grid">
    <div className="glance-col">
      <section className="glance-hero"><span className="glance-k">{net < 0 ? "You owe" : "You are owed"}</span><strong className="glance-big">{money(Math.abs(net), currency)}</strong>
        <span className="glance-sub">{debtorNames.length ? `from ${debtorNames.join(" and ")} · ` : ""}{openBillCount} open bill{openBillCount === 1 ? "" : "s"}</span>
        {receiptTotal > 0 && <span className="glance-delta">▼ {money(receiptTotal, currency)} less than yesterday{latestReceipt ? ` — ${latestReceipt.payerName} settled ${latestReceipt.billName ?? "a payment"}` : ""}</span>}
      </section>
      {nextRecurring && nextDue && <section className="glance-due glance-tappable" role="button" tabIndex={0} onClick={onOpenBills} onKeyDown={(event) => { if (event.key === "Enter") onOpenBills(); }}><span className="glance-when">{nextDue.toLocaleDateString(undefined, { month: "short" }).toUpperCase()} {nextDue.getDate()}</span><span className="glance-due-what"><strong>{nextRecurring.name}</strong><small>recurring · splits {nextRecurring.templateConfig.allocations.length} way{nextRecurring.templateConfig.allocations.length === 1 ? "" : "s"}</small></span><strong className="glance-due-amt">{nextRecurring.expectedAmountCents === null ? "varies" : money(nextRecurring.expectedAmountCents, currency)}</strong></section>}
      <button className="glance-add" onClick={onBill}><Plus size={17} /> Add a bill</button>
    </div>
    <div className="glance-col">
      {data.balances.length > 0 && <div className="glance-zone">
        {owedToMe.map((item) => <BalanceCard key={`${item.payerUserId}:${item.recipientUserId}`} item={item} currency={currency} mine direction="in" onOpen={onOpenBills} onConfirm={onPayment} onNudge={onNudge} onBillDetail={onBillDetail} />)}
        {iOwe.map((item) => <BalanceCard key={`${item.payerUserId}:${item.recipientUserId}`} item={item} currency={currency} mine direction="out" onOpen={onOpenBills} onConfirm={onPayment} onNudge={onNudge} onBillDetail={onBillDetail} />)}
        {others.map((item) => <BalanceCard key={`${item.payerUserId}:${item.recipientUserId}`} item={item} currency={currency} mine={false} direction="other" onOpen={onOpenBills} onConfirm={onPayment} onNudge={onNudge} onBillDetail={onBillDetail} />)}
      </div>}
      {!data.balances.length && <section className="glance-card glance-settled"><Check size={26} /><strong>Everyone is settled up</strong><small>New bills will appear here as balances open.</small></section>}
    </div>
  </div>;
}

function BillLine({ bill, currency, onClick }: { bill: Bill; currency: string; onClick: () => void }) {
  const Icon = CATEGORY_ICONS[bill.category] ?? CATEGORY_ICONS.other;
  const settled = bill.status === "settled";
  return <button className={`bill-line${settled ? " done" : " open"}`} onClick={onClick}>
    <Icon size={19} weight="duotone" className={`bill-cat cat-${bill.category}`} aria-hidden="true" />
    <span className="bill-line-text"><strong>{bill.name}</strong><small>{bill.periodLabel} · {CATEGORY_LABELS[bill.category] ?? CATEGORY_LABELS.other} · {bill.amountState}</small></span>
    <span className="bill-line-amt"><b>{money(bill.amountCents, currency)}</b><small>{settled ? "SETTLED ✓" : "OUTSTANDING"}</small></span>
  </button>;
}

function Bills({ data, onBillDetail, onEditRecurring }: { data: HouseholdData; onBillDetail: (id: string) => void; onEditRecurring: (item: Recurring) => void }) {
  const currency = data.household.currency;
  const open = data.bills.filter((bill) => bill.status === "open");
  const settled = data.bills.filter((bill) => bill.status === "settled");
  const openTotal = open.reduce((sum, bill) => sum + bill.amountCents, 0);
  const settledTotal = settled.reduce((sum, bill) => sum + bill.amountCents, 0);
  const recorded = data.bills.reduce((sum, bill) => sum + bill.amountCents, 0);
  const openBalances = data.balances.reduce((sum, item) => sum + item.amountCents, 0);
  const categoryTotals = useMemo(() => {
    const totals = new Map<BillCategory, number>();
    for (const bill of data.bills) totals.set(bill.category, (totals.get(bill.category) ?? 0) + bill.amountCents);
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [data.bills]);
  const spendTotal = categoryTotals.reduce((sum, [, amount]) => sum + amount, 0);
  const schedules = [...data.recurring].sort((a, b) => +new Date(a.nextOccurrence) - +new Date(b.nextOccurrence));
  const monthlyEquivalent = Math.round(schedules.reduce((sum, item) => { if (!item.active || item.expectedAmountCents === null) return sum; const factor = item.cadence === "weekly" ? 52 / 12 : item.cadence === "monthly" ? 1 : item.cadence === "quarterly" ? 1 / 3 : 1 / 12; return sum + item.expectedAmountCents * factor; }, 0));
  return <section className="page-content bills-view">
    <div className="bills-stats">
      <div><small>RECORDED</small><b>{money(recorded, currency)}</b></div>
      <div className="accent"><small>OPEN BALANCES</small><b>{money(openBalances, currency)}</b></div>
      <div><small>BILLS</small><b>{open.length} / {data.bills.length}</b></div>
    </div>
    {categoryTotals.length > 0 && <div className="category-breakdown"><p className="eyebrow">SPENDING BY CATEGORY</p>{categoryTotals.map(([category, amountCents]) => <div className="category-line" key={category}><span>{CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other}</span><span className="category-bar"><span style={{ width: `${spendTotal ? Math.max(3, Math.round(amountCents / spendTotal * 100)) : 0}%` }} /></span><strong>{money(amountCents, currency)}</strong></div>)}</div>}
    <div className="bills-band">
      <div className="bills-band-head"><strong>Outstanding</strong><small>{open.length} bill{open.length === 1 ? "" : "s"} · needs settling</small><span className="bills-sum open">{money(openTotal, currency)}</span></div>
      {open.map((bill) => <BillLine key={bill.id} bill={bill} currency={currency} onClick={() => onBillDetail(bill.id)} />)}
      {!open.length && <p className="empty-copy">No outstanding expenses. Everyone is settled up.</p>}
    </div>
    <div className="bills-band quiet">
      <div className="bills-band-head"><strong>Settled</strong><small>{settled.length} bill{settled.length === 1 ? "" : "s"}</small><span className="bills-sum done">{money(settledTotal, currency)}</span></div>
      {settled.map((bill) => <BillLine key={bill.id} bill={bill} currency={currency} onClick={() => onBillDetail(bill.id)} />)}
      {!settled.length && <p className="empty-copy">No settled expenses yet.</p>}
    </div>
    <div className="bills-band quiet">
      <div className="bills-band-head"><strong>Scheduled</strong><small>{schedules.length} recurring · tap to edit</small>{monthlyEquivalent > 0 && <span className="bills-sum sched">≈ {money(monthlyEquivalent, currency)} / mo</span>}</div>
      {schedules.map((item) => { const date = new Date(item.nextOccurrence); return <button className="bill-line sched" key={item.id} onClick={() => onEditRecurring(item)}>
        <span className="bill-when">{date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()} {date.getDate()}</span>
        <span className="bill-line-text"><strong>{item.name}</strong><small>{item.cadence} · splits {item.templateConfig.allocations.length} way{item.templateConfig.allocations.length === 1 ? "" : "s"}</small></span>
        <span className="bill-line-amt"><b>{item.expectedAmountCents === null ? "varies" : money(item.expectedAmountCents, currency)}</b><small>{item.active ? "RENEWS" : "PAUSED"}</small></span>
      </button>; })}
      {!schedules.length && <p className="empty-copy">No scheduled bills yet. Enable recurrence while adding an expense.</p>}
    </div>
  </section>;
}
function Balances({ data, user, onPayment, onNudge, onInvite }: { data: HouseholdData; user: User; onPayment: () => void; onNudge: (balance: Balance) => Promise<void>; onInvite: () => void }) {
  const [view, setView] = useState<"direct" | "simplified">("direct");
  const showSimplified = view === "simplified" && data.simplifiedBalances.length > 0;
  const items = showSimplified ? data.simplifiedBalances : data.balances;
  return <section className="page-content balances-view"><div className="page-toolbar"><p>{data.balances.length ? showSimplified ? `${data.simplifiedBalances.length} suggested repayment${data.simplifiedBalances.length === 1 ? "" : "s"} would settle the whole household.` : `${data.balances.length} open person-to-person balance${data.balances.length === 1 ? "" : "s"}.` : "No open person-to-person balances."}</p><span className="balance-toolbar-actions">{data.balances.length > 0 && <div className="filter-pills bill-status-filter"><button className={view === "direct" ? "selected" : ""} onClick={() => setView("direct")}>Direct</button><button className={view === "simplified" ? "selected" : ""} onClick={() => setView("simplified")}>Simplified</button></div>}<button className="secondary-button" onClick={onInvite}><UserPlus size={15} /> Invite</button></span></div>
    {showSimplified && <p className="simplified-note">A suggested plan that clears every balance with the fewest payments. It never changes the ledger: confirm actual repayments as they happen, and the direct balances remain the record.</p>}
    <div className="balance-lines flat-list">{items.map((item) => <div key={`${item.payerUserId}:${item.recipientUserId}`}><div className="avatar-pair large"><Avatar name={item.payerName ?? ""} /><Avatar name={item.recipientName ?? ""} /></div><span><strong>{item.payerUserId === user.id ? `You ${showSimplified ? "would pay" : "owe"} ${item.recipientName}` : item.recipientUserId === user.id ? `${item.payerName} ${showSimplified ? "would pay" : "owes"} you` : `${item.payerName} ${showSimplified ? "would pay" : "owes"} ${item.recipientName}`}</strong><small>{showSimplified ? "Suggested repayment" : "Outstanding household balance"}</small></span><strong>{money(item.amountCents, data.household.currency)}</strong>{!showSimplified && item.recipientUserId === user.id && <span className="balance-actions"><button className="secondary-button" onClick={() => void onNudge(item)}><BellRing size={15} /> Remind</button><button className="secondary-button" onClick={onPayment}>Confirm</button></span>}</div>)}{!items.length && <p className="empty-copy">Everyone is settled up.</p>}</div></section>;
}
function Activity({ data, householdId, onBillDetail }: { data: HouseholdData; householdId: string; onBillDetail: (id: string) => void }) {
  const items = [
    ...data.bills.map((bill) => ({ id: `bill:${bill.id}`, billId: bill.id, when: bill.createdAt, title: `${bill.name} added`, detail: `${money(bill.amountCents, data.household.currency)} · ${bill.status === "settled" ? "Settled" : "Outstanding"} · Added by ${bill.createdByName ?? "a household member"}`, kind: "bill" as const, category: bill.category, settled: bill.status === "settled" })),
    ...data.payments.map((payment) => ({ id: `payment:${payment.id}`, billId: payment.billId ?? undefined, when: payment.paidAt, title: payment.note === "Marked settled" && payment.billName ? `${payment.payerName} settled their share of ${payment.billName}` : payment.billName ? `${payment.payerName} paid toward ${payment.billName}` : `${payment.payerName ?? "A member"} recorded a general payment`, detail: `${money(payment.amountCents, data.household.currency)} to ${payment.recipientName ?? "another member"} · Recorded by ${payment.actorName ?? "a household member"}`, kind: "payment" as const })),
    ...data.closures.map((closure) => ({ id: `closure:${closure.id}`, billId: closure.billId, when: closure.changedAt, title: `${closure.billName} closed without another payment`, detail: `Closed by ${closure.actorName}`, kind: "closure" as const })),
  ].sort((a, b) => +new Date(b.when) - +new Date(a.when));

  return <section className="page-content activity-view"><div className="page-toolbar"><p>Every bill, settlement, closure, and payment stays reviewable here.</p><a className="secondary-button" href={`/api/households/${householdId}/export`} download><Download size={16} /> Export CSV</a></div><div className="timeline flat-list">{items.map((item) => <div className="timeline-group" key={item.id}><button className="timeline-item" disabled={!item.billId} onClick={() => item.billId && onBillDetail(item.billId)}>{item.kind === "bill" ? <CategoryIcon category={item.category} settled={item.settled} /> : <span className={`activity-icon ${item.kind === "closure" ? "yellow" : "mint"}`}>{item.kind === "closure" ? <Check size={18} /> : <CreditCard size={18} />}</span>}<span><strong>{item.title}</strong><small>{item.detail}</small></span><time>{new Date(item.when).toLocaleDateString()}</time></button></div>)}{!items.length && <p className="empty-copy">Activity will appear here as bills, settlements, closures, and payments are recorded.</p>}</div></section>;
}

function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={close}><X size={20} /></button></div><div className="modal-body">{children}</div></section></div>; }

function BillModal({ data, currentUserId, initial, close, save }: { data: HouseholdData; currentUserId?: string; initial?: BillDetailData; close: () => void; save: (body: unknown, recurring?: unknown) => Promise<void> }) {
  const initialAllocations = Object.fromEntries((initial?.allocations ?? []).map((item) => [item.userId, initial?.bill.allocationMethod === "percentage" ? String((item.percentageBasisPoints ?? 0) / 100) : (item.amountCents / 100).toFixed(2)]));
  const defaultPayer = initial?.contributions[0]?.userId ?? data.members.find((member) => member.id === currentUserId)?.id ?? data.members[0]?.id ?? "";
  const [name, setName] = useState(initial?.bill.name ?? ""); const [category, setCategory] = useState<BillCategory>(initial?.bill.category ?? "other"); const [amount, setAmount] = useState(initial ? (initial.bill.amountCents / 100).toFixed(2) : ""); const [estimated, setEstimated] = useState(initial?.bill.amountState === "estimated"); const [method, setMethod] = useState<"equal" | "percentage" | "fixed">((initial?.bill.allocationMethod as "equal" | "percentage" | "fixed") ?? "equal"); const [payerId, setPayerId] = useState(defaultPayer); const [allocationValues, setAllocationValues] = useState<Record<string, string>>(initialAllocations); const [makeRecurring, setMakeRecurring] = useState(false); const [cadence, setCadence] = useState<Recurring["cadence"]>("monthly"); const [nextDate, setNextDate] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const amountCents = Math.round(Number(amount) * 100); if (!amountCents) return;
    if (!payerId) { setError("Choose who paid the bill"); return; }
    const contributions = [{ userId: payerId, amountCents }];
    let allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }>;
    if (method === "equal") { const base = Math.floor(amountCents / data.members.length); let remainder = amountCents - base * data.members.length; allocations = data.members.map((member) => ({ userId: member.id, amountCents: base + (remainder-- > 0 ? 1 : 0) })); }
    else if (method === "fixed") allocations = data.members.map((member) => ({ userId: member.id, amountCents: Math.round(Number(allocationValues[member.id] || 0) * 100) })).filter((item) => item.amountCents > 0);
    else { const basis = data.members.map((member) => ({ userId: member.id, percentageBasisPoints: Math.round(Number(allocationValues[member.id] || 0) * 100) })); let allocated = 0; allocations = basis.map((item, index) => { const amountForMember = index === basis.length - 1 ? amountCents - allocated : Math.floor(amountCents * item.percentageBasisPoints / 10_000); allocated += amountForMember; return { ...item, amountCents: amountForMember }; }).filter((item) => item.amountCents > 0 || item.percentageBasisPoints > 0); }
    if (makeRecurring && !nextDate) { setError("Choose the next occurrence date"); return; }
    const body = { name, category, amountCents, periodLabel: initial?.bill.periodLabel ?? new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }), dueDate: initial?.bill.dueDate ?? null, amountState: estimated ? "estimated" : "final", allocationMethod: method, contributions, allocations, ...(initial ? { revision: initial.bill.revision } : {}) };
    const recurring = makeRecurring ? { name, category, expectedAmountCents: amountCents, cadence, nextOccurrence: new Date(`${nextDate}T12:00:00Z`).toISOString(), allocationMethod: method, contributions, allocations, active: true } : undefined;
    setBusy(true); setError(""); try { await save(body, recurring); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save bill"); setBusy(false); }
  }
  const allocationTotal = data.members.reduce((sum, member) => sum + Number(allocationValues[member.id] || 0), 0);
  const allocationTarget = method === "percentage" ? 100 : Number(amount || 0);
  const allocationRemaining = allocationTarget - allocationTotal;
  const allocationComplete = method === "equal" || Math.abs(allocationRemaining) < .001;
  const allocationProgress = method === "percentage"
    ? `${Math.abs(allocationRemaining).toFixed(2)}% ${allocationRemaining < 0 ? "over" : "remaining"}`
    : `${money(Math.round(Math.abs(allocationRemaining) * 100), data.household.currency)} ${allocationRemaining < 0 ? "over" : "remaining"}`;
  return <Modal title={initial ? "Edit bill" : "Add a bill"} subtitle={data.household.name} close={close}><form onSubmit={submit}><div className="form-grid"><label className="full">Bill name<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label><label>Amount ({data.household.currency})<input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><label>Category<select value={category} onChange={(e) => setCategory(e.target.value as BillCategory)}>{BILL_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}</select></label><label className="toggle-row full"><span><strong>Estimated amount</strong><small>Finalize it later with a revision.</small></span><input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} /></label><fieldset className="full"><legend>Who paid the external bill?</legend><div className="payer-options">{data.members.map((member) => <label key={member.id} className={`payer-option ${payerId === member.id ? "selected" : ""}`}><input type="checkbox" checked={payerId === member.id} onChange={() => setPayerId(member.id)} /><Avatar name={member.displayName} /><span><strong>{member.displayName}</strong><small>Paid the full {amount ? money(Math.round(Number(amount) * 100), data.household.currency) : "bill"}</small></span></label>)}</div><small className="valid-total">Choose one person. The full expense is credited to them.</small></fieldset><fieldset className="full"><legend>How is responsibility allocated?</legend><div className="segmented">{(["equal", "percentage", "fixed"] as const).map((item) => <button type="button" key={item} className={method === item ? "selected" : ""} onClick={() => setMethod(item)}>{item === "percentage" ? "Percent" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>{method !== "equal" && <div className="money-rows">{data.members.map((member) => <label key={member.id}><span>{member.displayName}</span><span className="amount-field"><input aria-label={`${member.displayName} ${method === "percentage" ? "percentage" : "amount"}`} type="number" inputMode="decimal" min="0" step=".01" placeholder="0" value={allocationValues[member.id] ?? ""} onChange={(e) => setAllocationValues({ ...allocationValues, [member.id]: e.target.value })} /><em>{method === "percentage" ? "%" : data.household.currency}</em></span></label>)}</div>}<small className={allocationComplete ? "valid-total" : "invalid-total"}>{method === "equal" ? `Split equally across ${data.members.length} members` : allocationProgress}</small></fieldset>{!initial && <><label className="toggle-row full recurring-toggle"><span><strong>Make this expense recurring</strong><small>Create future bills automatically using this payer and allocation.</small></span><input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} /></label>{makeRecurring && <div className="recurring-details full"><label>Cadence<select value={cadence} onChange={(e) => setCadence(e.target.value as Recurring["cadence"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label><label>Next occurrence<input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required /></label></div>}</>}</div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy || !name || !amount || !payerId}>{busy ? "Saving…" : initial ? "Save changes" : makeRecurring ? "Add recurring bill" : "Add bill"}</button></div></form></Modal>;
}

function PaymentModal({ data, currentUserId, specific, close, save }: { data: HouseholdData; currentUserId: string; specific: (Balance & { billId: string }) | null; close: () => void; save: (body: unknown) => Promise<void> }) {
  const choices = (specific ? [specific] : data.balances).filter((item) => item.recipientUserId === currentUserId); const [index, setIndex] = useState(0); const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [idempotencyKey] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const balance = choices[index];
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!balance) return; setBusy(true); setError(""); try { await save({ idempotencyKey, billId: specific?.billId ?? null, payerUserId: balance.payerUserId, recipientUserId: balance.recipientUserId, amountCents: Math.round(Number(amount) * 100), note, paidAt: new Date().toISOString() }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm payment"); setBusy(false); } }
  return <Modal title="Confirm a payment" subtitle={specific ? "Confirm money received for this bill" : "Confirm money you received toward a balance"} close={close}>{balance ? <form onSubmit={submit}><div className="form-grid"><label className="full">Balance<select value={index} disabled={Boolean(specific)} onChange={(e) => { setIndex(Number(e.target.value)); setAmount(""); }}>{choices.map((item, itemIndex) => <option key={`${item.payerUserId}:${item.recipientUserId}`} value={itemIndex}>{item.payerName} → {item.recipientName} · {money(item.amountCents, data.household.currency)}</option>)}</select></label><label className="full">Amount received<input type="number" inputMode="decimal" min="0.01" max={(balance.amountCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><label className="full">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy || !amount}>{busy ? "Confirming…" : "Confirm payment"}</button></div></form> : <p>You have no received payments to confirm.</p>}</Modal>;
}

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

function BillDetailModal({ detail, userId, currency, close, edit, remove, record, settle, closeWithoutPayment, addComment, uploadAttachment, removeAttachment, attachmentHref }: { detail: BillDetailData; userId: string; currency: string; close: () => void; edit: () => void; remove: () => Promise<void>; record: (item: BillDetailData["obligations"][number]) => void; settle: (item: BillDetailData["obligations"][number]) => Promise<void>; closeWithoutPayment: () => Promise<void>; addComment: (body: string) => Promise<void>; uploadAttachment: (file: File) => Promise<void>; removeAttachment: (attachmentId: string) => Promise<void>; attachmentHref: (attachmentId: string) => string }) {
  const [comment, setComment] = useState("");
  const [workError, setWorkError] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
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
  const isSettled = detail.bill.status === "settled"; return <Modal title={detail.bill.name} subtitle={`${detail.bill.periodLabel} · ${CATEGORY_LABELS[detail.bill.category] ?? CATEGORY_LABELS.other} · ${detail.bill.amountState} · revision ${detail.bill.revision}`} close={close}><div className="detail-status-row"><p className="detail-total">{money(detail.bill.amountCents, currency)}</p><span className={`status-pill ${isSettled ? "done" : "open"}`}>{isSettled ? "Settled" : "Outstanding"}</span></div><div className="detail-section"><h3>Paid to the external recipient</h3>{detail.contributions.map((item) => <div className="contribution" key={item.id}><Avatar name={item.displayName} /><span><strong>{item.displayName}</strong><small>{new Date(item.paidAt).toLocaleDateString()}</small></span><strong>{money(item.amountCents, currency)}</strong></div>)}</div><div className="detail-section"><h3>{detail.bill.allocationMethod} allocation</h3>{detail.allocations.map((item) => <div className="contribution" key={item.id}><Avatar name={item.displayName} /><span><strong>{item.displayName}</strong><small>{item.percentageBasisPoints === null ? "Responsibility" : `${item.percentageBasisPoints / 100}%`}</small></span><strong>{money(item.amountCents, currency)}</strong></div>)}</div><div className="detail-section"><h3>Settlement by person</h3>{detail.obligations.map((item) => { const canConfirm = item.creditorUserId === userId; const paid = item.outstandingAmountCents === 0; return <div className="obligation" key={item.id}><div className="avatar-pair"><Avatar name={item.debtorName} /><Avatar name={item.creditorName} /></div><span><strong>{item.debtorName} → {item.creditorName}</strong><small>{money(item.paidAmountCents, currency)} paid of {money(item.originalAmountCents, currency)}</small></span><strong>{money(item.outstandingAmountCents, currency)}</strong>{paid ? <span className="status-pill done">Settled</span> : isSettled ? <span className="status-pill done">Closed</span> : canConfirm ? <span className="obligation-actions"><button className="partial-button" onClick={() => record(item)}>Partial</button><button onClick={() => settle(item)}>Confirm all</button></span> : <span className="status-pill open">Outstanding</span>}</div>; })}{!detail.obligations.length && <p className="empty-copy">No repayments are required for this expense.</p>}</div>
    <div className="detail-section"><h3>Receipts and files</h3>{detail.attachments.map((item) => <div className="attachment-row" key={item.id}><span className="activity-icon blue"><Paperclip size={16} /></span><a href={attachmentHref(item.id)} target="_blank" rel="noreferrer"><strong>{item.fileName}</strong><small>{(item.sizeBytes / 1024).toFixed(0)} KB · {item.uploadedByName} · {new Date(item.createdAt).toLocaleDateString()}</small></a><button className="icon-button" aria-label={`Remove ${item.fileName}`} onClick={() => { if (confirm("Remove this attachment? The removal stays in the bill history.")) void removeAttachment(item.id).catch((cause) => setWorkError(cause instanceof Error ? cause.message : "The attachment could not be removed")); }}><Trash2 size={15} /></button></div>)}{!detail.attachments.length && <p className="empty-copy">No receipts yet. Attach the receipt or invoice so everyone can check the numbers.</p>}<label className={`attach-button secondary-button ${uploadBusy ? "busy" : ""}`}><Paperclip size={15} /> {uploadBusy ? "Uploading…" : "Attach a receipt"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" hidden disabled={uploadBusy} onChange={chooseFile} /></label></div>
    <div className="detail-section"><h3>Comments</h3><div className="comment-thread">{detail.comments.map((item) => <div className="comment-item" key={item.id}><Avatar name={item.authorName} /><span><strong>{item.authorName} <time>{new Date(item.createdAt).toLocaleString()}</time></strong><small>{item.body}</small></span></div>)}{!detail.comments.length && <p className="empty-copy">No comments yet. Ask a question or leave context for the household.</p>}</div><form className="comment-form" onSubmit={submitComment}><input value={comment} maxLength={1000} placeholder="Write a comment…" onChange={(e) => setComment(e.target.value)} /><button className="secondary-button" disabled={commentBusy || !comment.trim()}><MessageSquare size={15} /> {commentBusy ? "Posting…" : "Post"}</button></form></div>
    {workError && <p className="form-error">{workError}</p>}<div className="detail-section audit"><h3>Bill history</h3>{detail.history.map((item) => <div key={item.id}><span className="history-dot" /><span><strong>{item.changeType.replaceAll("_", " ")}</strong><small>{item.changedBy} · {new Date(item.changedAt).toLocaleString()}</small></span></div>)}</div><div className="modal-actions bill-detail-actions"><button className="secondary-button danger-button" onClick={remove}>Remove</button>{!isSettled && <button className="secondary-button close-expense-button" onClick={closeWithoutPayment}>Close without payment</button>}{!isSettled && <button className="secondary-button" onClick={edit}>Edit terms</button>}<button className="primary-button" onClick={close}>Done</button></div></Modal>; }

function RecurringModal({ data, initial, close, save }: { data: HouseholdData; initial: Recurring; close: () => void; save: (body: unknown) => Promise<void> }) {
  const [name, setName] = useState(initial.name); const [amount, setAmount] = useState(initial.expectedAmountCents ? (initial.expectedAmountCents / 100).toFixed(2) : ""); const [payer] = useState(initial.templateConfig.contributions[0]?.userId ?? data.members[0]?.id ?? ""); const [cadence, setCadence] = useState<Recurring["cadence"]>(initial.cadence); const [nextDate, setNextDate] = useState(new Date(initial.nextOccurrence).toISOString().slice(0, 10)); const [active, setActive] = useState(initial.active); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); const amountCents = Math.round(Number(amount) * 100); let contributions = initial.templateConfig.contributions; let allocations = initial.templateConfig.allocations; let allocationMethod = initial.allocationMethod; if (initial.expectedAmountCents !== amountCents) { const base = Math.floor(amountCents / data.members.length); let remainder = amountCents - base * data.members.length; contributions = [{ userId: payer, amountCents }]; allocations = data.members.map((member) => ({ userId: member.id, amountCents: base + (remainder-- > 0 ? 1 : 0) })); allocationMethod = "equal"; } setBusy(true); setError(""); try { await save({ name, category: initial.category, expectedAmountCents: amountCents, cadence, nextOccurrence: new Date(`${nextDate}T12:00:00Z`).toISOString(), allocationMethod, contributions, allocations, active }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save schedule"); setBusy(false); } }
  return <Modal title="Edit future schedule" subtitle="Historical bill instances will not change" close={close}><form onSubmit={submit}><div className="form-grid"><label className="full">Bill name<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label><label>Expected amount ({data.household.currency})<input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><label>Paid externally by<select value={payer} disabled>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>Cadence<select value={cadence} onChange={(e) => setCadence(e.target.value as Recurring["cadence"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label><label>Next occurrence<input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required /></label><label className="toggle-row"><span><strong>Schedule active</strong><small>Pause future generation without changing history.</small></span><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy || !name || !amount || !payer || !nextDate}>{busy ? "Saving…" : "Save future schedule"}</button></div></form></Modal>;
}


function EmptyAccount({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) { return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span></div><span className="setup-icon"><WalletCards size={24} /></span><h1>No Household assigned</h1><p>Hello {user.displayName}. An administrator needs to add your account to a Household before financial data is available.</p><a className="secondary-button" href="/settings">User settings</a><button className="secondary-button" onClick={onLogout}>Sign out</button></section></main>; }
