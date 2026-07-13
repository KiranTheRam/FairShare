"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Repeat2,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Tab = "overview" | "bills" | "balances" | "activity";
type Modal = "bill" | "payment" | "detail" | "settings" | null;
type Theme = "dark" | "light";

const people = {
  Alex: { initials: "AM", color: "peach" },
  Kiran: { initials: "KP", color: "mint" },
  Sam: { initials: "SL", color: "blue" },
  Jordan: { initials: "JR", color: "violet" },
};

const bills = [
  { name: "July rent", meta: "Jul 1 · Final", amount: "$2,400.00", status: "2 unsettled", icon: Home, tone: "coral" },
  { name: "Internet", meta: "Jun 18 · Final", amount: "$92.00", status: "Settled", icon: ReceiptText, tone: "teal" },
  { name: "Electricity", meta: "Jun 12 · Final", amount: "$148.20", status: "1 unsettled", icon: Sparkles, tone: "yellow" },
  { name: "Groceries", meta: "Jun 8 · Final", amount: "$86.44", status: "Settled", icon: ReceiptText, tone: "blue" },
];

function Avatar({ name, small = false }: { name: keyof typeof people; small?: boolean }) {
  const person = people[name];
  return <span className={`avatar ${person.color} ${small ? "small" : ""}`} aria-label={name}>{person.initials}</span>;
}

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="roof" />
      <span className="door" />
    </div>
  );
}

export function HouseholdApp() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [householdMenu, setHouseholdMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [estimated, setEstimated] = useState(false);
  const [splitType, setSplitType] = useState("Equal");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem("fairshare-theme") === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const title = useMemo(() => ({
    overview: "Good morning, Alex",
    bills: "Bills",
    balances: "Balances",
    activity: "Household activity",
  }[activeTab]), [activeTab]);

  const handleInstall = async () => {
    if (installPrompt && "prompt" in installPrompt) {
      await (installPrompt as Event & { prompt: () => Promise<void> }).prompt();
      setInstallPrompt(null);
      return;
    }
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
      setToast("Notifications are ready for this Household");
    } else {
      setToast("Use your browser menu to add FairShare to your home screen");
    }
  };

  const recordBill = () => {
    setModal(null);
    setBillName("");
    setBillAmount("");
    setToast("Bill added to Maple House");
  };

  const recordPayment = () => {
    setModal(null);
    setToast("Payment recorded — Kiran will be notified");
  };

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const chooseTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("fairshare-theme", nextTheme);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><Logo /><span>FairShare</span></div>
        <button className="household-switcher" onClick={() => setHouseholdMenu(!householdMenu)}>
          <span className="house-avatar">MH</span>
          <span><small>Household</small><strong>Maple House</strong></span>
          <ChevronDown size={17} />
        </button>
        {householdMenu && (
          <div className="household-menu">
            <button><span className="house-avatar tiny">LH</span><span><strong>Lake House</strong><small>3 members</small></span></button>
            <button className="new-house"><Plus size={15} /> Join a Household</button>
          </div>
        )}
        <nav className="side-nav" aria-label="Household navigation">
          <NavButton active={activeTab === "overview"} icon={LayoutDashboard} label="Overview" onClick={() => selectTab("overview")} />
          <NavButton active={activeTab === "bills"} icon={ReceiptText} label="Bills" onClick={() => selectTab("bills")} badge="2" />
          <NavButton active={activeTab === "balances"} icon={WalletCards} label="Balances" onClick={() => selectTab("balances")} />
          <NavButton active={activeTab === "activity"} icon={FileText} label="Activity" onClick={() => selectTab("activity")} />
        </nav>
        <div className="side-bottom">
          <a className="side-link" href="/onboarding"><Users size={19} /> Household settings</a>
          <a className="side-link" href="/admin"><ShieldCheck size={19} /> Admin console</a>
          <button className="profile-card" onClick={() => setModal("settings")}>
            <Avatar name="Alex" small />
            <span><strong>Alex Morgan</strong><small>alex@maple.house</small></span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button>
          <button className="mobile-house" onClick={() => setSidebarOpen(true)}><span className="house-avatar tiny">MH</span><strong>Maple House</strong><ChevronDown size={15} /></button>
          <div className="top-actions">
            <button className="install-pill" onClick={handleInstall}><ArrowDownLeft size={16} /> <span>Install app</span></button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}>
              <Bell size={20} /><span className="unread-dot" />
            </button>
            <Avatar name="Alex" small />
          </div>
          {notificationsOpen && (
            <div className="notification-panel">
              <div className="panel-title"><strong>Notifications</strong><span>2 new</span></div>
              <button><span className="activity-icon coral"><ReceiptText size={17} /></span><span><strong>July rent was added</strong><small>Kiran added a $2,400 bill · 18m</small></span></button>
              <button><span className="activity-icon mint"><CreditCard size={17} /></span><span><strong>Sam paid you $75</strong><small>General balance payment · 2h</small></span></button>
              <button className="notification-settings"><Settings size={15} /> Notification preferences</button>
            </div>
          )}
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MAPLE HOUSE · JULY 2026</p>
              <h1>{title}</h1>
              <p>{activeTab === "overview" ? "Here’s where everyone stands today." : tabSubtitle(activeTab)}</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" onClick={() => setModal("payment")}><ArrowRight size={17} /> Record payment</button>
              <button className="primary-button" onClick={() => setModal("bill")}><Plus size={18} /> Add bill</button>
            </div>
          </div>

          {activeTab === "overview" && <Overview onBill={() => setModal("bill")} onPayment={() => setModal("payment")} onDetail={() => setModal("detail")} onNavigate={selectTab} />}
          {activeTab === "bills" && <BillsView onDetail={() => setModal("detail")} />}
          {activeTab === "balances" && <BalancesView onPayment={() => setModal("payment")} />}
          {activeTab === "activity" && <ActivityView />}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        <MobileNav active={activeTab === "overview"} icon={LayoutDashboard} label="Home" onClick={() => selectTab("overview")} />
        <MobileNav active={activeTab === "bills"} icon={ReceiptText} label="Bills" onClick={() => selectTab("bills")} />
        <button className="fab" aria-label="Add bill" onClick={() => setModal("bill")}><Plus size={24} /></button>
        <MobileNav active={activeTab === "balances"} icon={WalletCards} label="Balances" onClick={() => selectTab("balances")} />
        <MobileNav active={activeTab === "activity"} icon={FileText} label="Activity" onClick={() => selectTab("activity")} />
      </nav>

      {modal === "bill" && (
        <Modal title="Add a bill" subtitle="Maple House" onClose={() => setModal(null)}>
          <div className="form-grid">
            <label className="full">Bill name<input value={billName} onChange={(e) => setBillName(e.target.value)} placeholder="e.g. July internet" autoFocus /></label>
            <label>Amount<div className="currency-input"><span>$</span><input inputMode="decimal" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder="0.00" /></div></label>
            <label>Due date<input type="date" defaultValue="2026-07-18" /></label>
            <label className="toggle-row full"><span><strong>This amount is estimated</strong><small>You can finalize it later without losing history.</small></span><input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} /></label>
            <fieldset className="full"><legend>How should it be split?</legend><div className="segmented">{["Equal", "Percent", "Amounts"].map((type) => <button type="button" className={splitType === type ? "selected" : ""} onClick={() => setSplitType(type)} key={type}>{type}</button>)}</div></fieldset>
            <div className="allocation-preview full">
              {(["Alex", "Kiran", "Sam", "Jordan"] as const).map((name) => <div key={name}><Avatar name={name} small /><span>{name}</span><strong>{billAmount ? `$${(Number(billAmount || 0) / 4).toFixed(2)}` : "25%"}</strong></div>)}
              <p><Check size={15} /> Allocation adds up to {splitType === "Percent" ? "100%" : billAmount ? `$${Number(billAmount).toFixed(2)}` : "the total"}</p>
            </div>
          </div>
          <div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={!billName || !billAmount} onClick={recordBill}>Add bill</button></div>
        </Modal>
      )}

      {modal === "payment" && (
        <Modal title="Record a payment" subtitle="Reduce a balance between two people" onClose={() => setModal(null)}>
          <div className="payment-direction"><Avatar name="Alex" /><ArrowRight size={20} /><Avatar name="Kiran" /><span><strong>You’re paying Kiran</strong><small>Current balance: $140.00</small></span></div>
          <div className="form-grid">
            <label className="full">Amount<div className="currency-input large"><span>$</span><input inputMode="decimal" defaultValue="40.00" /></div></label>
            <label className="full">Apply to<select defaultValue="rent"><option value="rent">July rent · $140 remaining</option><option value="general">General balance payment</option></select></label>
            <label className="full">Note <small>(optional)</small><input placeholder="e.g. Venmo payment" /></label>
          </div>
          <div className="modal-note"><ShieldCheck size={17} /><span>This records a repayment. It won’t change the original bill.</span></div>
          <div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" onClick={recordPayment}>Record $40 payment</button></div>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal title="User settings" subtitle="Preferences for Alex Morgan" onClose={() => setModal(null)}>
          <div className="settings-profile">
            <Avatar name="Alex" />
            <span><strong>Alex Morgan</strong><small>alex@maple.house</small></span>
            <span className="status-pill done">Active</span>
          </div>
          <section className="preference-section">
            <div><h3>Appearance</h3><p>Choose how FairShare looks on this device.</p></div>
            <div className="theme-options" role="radiogroup" aria-label="Color theme">
              <button role="radio" aria-checked={theme === "dark"} className={theme === "dark" ? "selected" : ""} onClick={() => chooseTheme("dark")}><Moon size={19} /><span><strong>Dark</strong><small>Default</small></span>{theme === "dark" && <Check size={16} />}</button>
              <button role="radio" aria-checked={theme === "light"} className={theme === "light" ? "selected" : ""} onClick={() => chooseTheme("light")}><Sun size={19} /><span><strong>Light</strong><small>Bright surfaces</small></span>{theme === "light" && <Check size={16} />}</button>
            </div>
          </section>
          <section className="preference-section">
            <div><h3>Household notifications</h3><p>Control the alerts delivered to this device.</p></div>
            <div className="notification-preferences">
              <label><span><strong>Bills and material edits</strong><small>New bills, final amounts, and allocation changes</small></span><input type="checkbox" defaultChecked /></label>
              <label><span><strong>Payments involving you</strong><small>Partial, full, and general balance payments</small></span><input type="checkbox" defaultChecked /></label>
            </div>
          </section>
          <div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>Done</button></div>
        </Modal>
      )}

      {modal === "detail" && <BillDetail onClose={() => setModal(null)} onPayment={() => setModal("payment")} />}
      {toast && <div className="toast"><span><Check size={16} /></span>{toast}</div>}
    </div>
  );
}

function NavButton({ active, icon: Icon, label, badge, onClick }: { active: boolean; icon: typeof Home; label: string; badge?: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick} aria-current={active ? "page" : undefined}><Icon size={19} /><span>{label}</span>{badge && <em>{badge}</em>}</button>;
}

function MobileNav({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Home; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={21} /><small>{label}</small></button>;
}

function tabSubtitle(tab: Tab) {
  if (tab === "bills") return "Current, historical, and recurring household expenses.";
  if (tab === "balances") return "Every open person-to-person obligation, clearly explained.";
  return "A chronological, auditable record of money moving through the Household.";
}

function Overview({ onBill, onPayment, onDetail, onNavigate }: { onBill: () => void; onPayment: () => void; onDetail: () => void; onNavigate: (tab: Tab) => void }) {
  return (
    <div className="dashboard-grid">
      <section className="summary-card">
        <div className="summary-top"><span className="summary-icon"><WalletCards size={21} /></span><span>Your overall position</span><button aria-label="Balance details"><MoreHorizontal size={18} /></button></div>
        <p>You owe</p><h2>$110.00</h2><span className="delta"><ArrowDownLeft size={14} /> $75 lower than last month</span>
        <div className="summary-divider" />
        <div className="mini-balance"><div className="avatar-pair"><Avatar name="Alex" small /><Avatar name="Kiran" small /></div><span><small>You owe Kiran</small><strong>$140.00</strong></span><ChevronRight size={18} /></div>
        <div className="mini-balance"><div className="avatar-pair"><Avatar name="Sam" small /><Avatar name="Alex" small /></div><span><small>Sam owes you</small><strong className="positive">$75.00</strong></span><ChevronRight size={18} /></div>
        <div className="mini-balance"><div className="avatar-pair"><Avatar name="Alex" small /><Avatar name="Jordan" small /></div><span><small>You owe Jordan</small><strong>$45.00</strong></span><ChevronRight size={18} /></div>
        <button className="text-button" onClick={() => onNavigate("balances")}>See all balances <ArrowRight size={15} /></button>
      </section>

      <section className="card attention-card">
        <div className="section-heading"><div><p className="eyebrow">NEEDS ATTENTION</p><h3>Two things to tidy up</h3></div><span className="count-badge">2</span></div>
        <button className="attention-item" onClick={onDetail}><span className="activity-icon yellow"><Sparkles size={18} /></span><span><strong>Electricity needs a final amount</strong><small>$128.00 estimate · due Jul 20</small></span><span className="action-chip">Finalize</span></button>
        <button className="attention-item"><span className="activity-icon coral"><Clock3 size={18} /></span><span><strong>July rent is partly unsettled</strong><small>$185.00 remains between members</small></span><ChevronRight size={18} /></button>
      </section>

      <section className="card recent-card">
        <div className="section-heading"><div><p className="eyebrow">RECENT BILLS</p><h3>This month at a glance</h3></div><button className="text-button" onClick={() => onNavigate("bills")}>View all</button></div>
        <div className="bill-list">
          {bills.slice(0, 3).map((bill) => <BillRow key={bill.name} bill={bill} onClick={onDetail} />)}
        </div>
      </section>

      <section className="card upcoming-card">
        <div className="section-heading"><div><p className="eyebrow">COMING UP</p><h3>Recurring bills</h3></div><Repeat2 size={19} /></div>
        <div className="calendar-item"><span className="date-tile"><b>18</b><small>JUL</small></span><span><strong>Internet</strong><small>Expected around $92</small></span><em>Monthly</em></div>
        <div className="calendar-item"><span className="date-tile"><b>01</b><small>AUG</small></span><span><strong>Rent</strong><small>$2,400 · split equally</small></span><em>Monthly</em></div>
        <a href="/onboarding" className="text-button">Manage recurring bills <ArrowRight size={15} /></a>
      </section>

      <section className="quick-card">
        <div><span className="quick-icon"><CircleDollarSign size={22} /></span><span><strong>Keep the ledger current</strong><small>Add an expense or settle up in seconds.</small></span></div>
        <div><button className="quick-action" onClick={onBill}><Plus size={18} /><span><strong>Add a bill</strong><small>Split an expense</small></span></button><button className="quick-action" onClick={onPayment}><CreditCard size={18} /><span><strong>Record payment</strong><small>Settle a balance</small></span></button></div>
      </section>
    </div>
  );
}

function BillRow({ bill, onClick }: { bill: (typeof bills)[number]; onClick: () => void }) {
  const Icon = bill.icon;
  return <button className="bill-row" onClick={onClick}><span className={`activity-icon ${bill.tone}`}><Icon size={18} /></span><span className="bill-main"><strong>{bill.name}</strong><small>{bill.meta}</small></span><span className="bill-amount"><strong>{bill.amount}</strong><small className={bill.status === "Settled" ? "settled" : ""}>{bill.status}</small></span><ChevronRight size={17} /></button>;
}

function BillsView({ onDetail }: { onDetail: () => void }) {
  return <section className="wide-card">
    <div className="list-toolbar"><div className="search-box"><Search size={17} /><input aria-label="Search bills" placeholder="Search bills" /></div><div className="filter-pills"><button className="selected">All</button><button>Open</button><button>Estimated</button><button>Settled</button></div><button className="secondary-button"><CalendarDays size={16} /> Jul 2026</button></div>
    <div className="month-total"><span><small>JULY SPENDING</small><strong>$2,640.20</strong></span><span><small>YOUR SHARE</small><strong>$660.05</strong></span><span><small>PAID TO VENDORS</small><strong>$2,548.20</strong></span><span><small>UNSETTLED BETWEEN MEMBERS</small><strong className="warn">$185.00</strong></span></div>
    <div className="bill-table"><div className="table-head"><span>Bill</span><span>Paid externally by</span><span>Total</span><span>Status</span><span /></div>{bills.map((bill, index) => <button key={bill.name} onClick={onDetail}><span className="table-bill"><span className={`activity-icon ${bill.tone}`}><bill.icon size={18} /></span><span><strong>{bill.name}</strong><small>{bill.meta}</small></span></span><span className="payer-stack"><Avatar name={index % 2 ? "Alex" : "Kiran"} small />{index === 0 && <Avatar name="Jordan" small />}</span><strong>{bill.amount}</strong><span className={`status-pill ${bill.status === "Settled" ? "done" : "open"}`}>{bill.status}</span><ChevronRight size={17} /></button>)}</div>
  </section>;
}

function BalancesView({ onPayment }: { onPayment: () => void }) {
  return <div className="balances-layout"><section className="wide-card balance-hero"><div><p className="eyebrow">YOUR NET POSITION</p><h2>You owe <span>$110.00</span></h2><p>That’s the total after accounting for what others owe you.</p></div><button className="primary-button" onClick={onPayment}><CreditCard size={17} /> Settle up</button></section><section className="wide-card"><div className="section-heading"><div><h3>Your balances</h3><p>These obligations stay itemized even when we show a net total.</p></div></div><div className="balance-lines"><BalanceLine from="Alex" to="Kiran" text="You owe Kiran" amount="$140.00" detail="July rent $100 · Electricity $40" onPay={onPayment} /><BalanceLine from="Sam" to="Alex" text="Sam owes you" amount="$75.00" detail="Groceries $35 · General balance $40" positive onPay={onPayment} /><BalanceLine from="Alex" to="Jordan" text="You owe Jordan" amount="$45.00" detail="July rent $45" onPay={onPayment} /></div></section><section className="wide-card all-balances"><div className="section-heading"><div><h3>Everyone in Maple House</h3><p>Pair-by-pair balances across the Household.</p></div></div><div className="relationship-grid"><Relationship from="Kiran" to="Jordan" amount="$20" /><Relationship from="Sam" to="Kiran" amount="$75" /><Relationship from="Jordan" to="Sam" amount="$32" /></div></section></div>;
}

function BalanceLine({ from, to, text, amount, detail, positive, onPay }: { from: keyof typeof people; to: keyof typeof people; text: string; amount: string; detail: string; positive?: boolean; onPay: () => void }) {
  return <div><div className="avatar-pair large"><Avatar name={from} /><Avatar name={to} /></div><span><strong>{text}</strong><small>{detail}</small></span><strong className={positive ? "positive" : ""}>{amount}</strong><button className="secondary-button" onClick={onPay}>{positive ? "Remind" : "Pay"}</button></div>;
}

function Relationship({ from, to, amount }: { from: keyof typeof people; to: keyof typeof people; amount: string }) {
  return <div><div className="avatar-pair"><Avatar name={from} small /><Avatar name={to} small /></div><span><strong>{from} owes {to}</strong><small>2 open obligations</small></span><strong>{amount}</strong></div>;
}

function ActivityView() {
  const activity = [
    { day: "TODAY", icon: CreditCard, tone: "mint", title: "Sam paid Alex $75.00", sub: "General balance payment · recorded by Sam", time: "9:42 AM" },
    { day: "TODAY", icon: ReceiptText, tone: "coral", title: "Kiran added July rent", sub: "$2,400.00 · split equally among 4 members", time: "8:18 AM" },
    { day: "YESTERDAY", icon: Sparkles, tone: "yellow", title: "Electricity amount estimated", sub: "$128.00 · created by Alex", time: "6:05 PM" },
    { day: "JUL 10", icon: Repeat2, tone: "blue", title: "Internet bill generated", sub: "Created from the monthly Internet schedule", time: "12:01 AM" },
    { day: "JUL 8", icon: CreditCard, tone: "mint", title: "Alex paid Kiran $40.00", sub: "Partial payment toward June rent · $60 remains", time: "4:22 PM" },
  ];
  let lastDay = "";
  return <section className="wide-card activity-view"><div className="list-toolbar"><div className="filter-pills"><button className="selected">Everything</button><button>Bills</button><button>Payments</button><button>Changes</button></div><button className="secondary-button"><CalendarDays size={16} /> Date range</button></div><div className="timeline">{activity.map((item, i) => { const Icon = item.icon; const showDay = lastDay !== item.day; lastDay = item.day; return <div className="timeline-group" key={i}>{showDay && <p className="timeline-day">{item.day}</p>}<button className="timeline-item"><span className={`activity-icon ${item.tone}`}><Icon size={18} /></span><span><strong>{item.title}</strong><small>{item.sub}</small></span><time>{item.time}</time><ChevronRight size={17} /></button></div>; })}</div></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></div><div className="modal-body">{children}</div></section></div>;
}

function BillDetail({ onClose, onPayment }: { onClose: () => void; onPayment: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="bill-title"><div className="drawer-header"><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button><button className="secondary-button"><MoreHorizontal size={17} /> Actions</button></div><div className="drawer-body"><span className="bill-detail-icon"><Home size={24} /></span><p className="eyebrow">JULY 2026 · FINAL</p><h2 id="bill-title">July rent</h2><p className="detail-total">$2,400.00</p><span className="status-pill open">$185.00 unsettled</span><div className="detail-section"><h3>Paid to the landlord</h3><div className="contribution"><Avatar name="Kiran" small /><span><strong>Kiran paid</strong><small>July 1</small></span><strong>$2,000.00</strong></div><div className="contribution"><Avatar name="Jordan" small /><span><strong>Jordan paid</strong><small>July 1</small></span><strong>$400.00</strong></div><p className="validated"><Check size={15} /> Contributions equal the $2,400.00 bill total</p></div><div className="detail-section"><h3>Split equally</h3><div className="allocation-bar"><span /><span /><span /><span /></div><div className="allocation-grid">{(["Alex", "Kiran", "Sam", "Jordan"] as const).map((name) => <div key={name}><Avatar name={name} small /><span>{name}</span><strong>$600</strong></div>)}</div></div><div className="detail-section"><div className="section-heading"><div><h3>Resulting balances</h3><p>After vendor payments and repayments</p></div></div><div className="obligation"><div className="avatar-pair"><Avatar name="Alex" small /><Avatar name="Kiran" small /></div><span><strong>Alex owes Kiran</strong><small>Paid $460 of $600</small></span><strong>$140.00</strong><button onClick={onPayment}>Pay</button></div><div className="obligation"><div className="avatar-pair"><Avatar name="Sam" small /><Avatar name="Kiran" small /></div><span><strong>Sam owes Kiran</strong><small>Paid $525 of $600</small></span><strong>$75.00</strong><button onClick={onPayment}>Pay</button></div></div><div className="detail-section audit"><h3>Bill history</h3><div><span className="history-dot" /><span><strong>Amount finalized at $2,400</strong><small>Kiran · Jul 1, 8:18 AM</small></span></div><div><span className="history-dot" /><span><strong>Bill created from Rent schedule</strong><small>System · Jul 1, 12:01 AM</small></span></div></div></div><div className="drawer-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onPayment}>Record payment</button></div></section></div>;
}
