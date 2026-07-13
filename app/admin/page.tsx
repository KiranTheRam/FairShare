"use client";

import { AlertTriangle, Building2, ChevronRight, KeyRound, LayoutDashboard, MoreHorizontal, Plus, Search, Settings, ShieldCheck, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const accounts = [
  { name: "Alex Morgan", email: "alex@maple.house", households: "Maple House, Lake House", status: "Active", initials: "AM", color: "peach" },
  { name: "Kiran Patel", email: "kiran@maple.house", households: "Maple House", status: "Active", initials: "KP", color: "mint" },
  { name: "Sam Lee", email: "sam@maple.house", households: "Maple House", status: "Active", initials: "SL", color: "blue" },
  { name: "Jordan Rivera", email: "jordan@maple.house", households: "Maple House", status: "Disabled", initials: "JR", color: "violet" },
];

export default function AdminPage() {
  const [section, setSection] = useState("Users");
  return <main className="admin-shell"><aside><div className="brand"><span className="brand-mark"><span className="roof" /><span className="door" /></span><span>FairShare</span><em>ADMIN</em></div><nav>{[{ label: "Overview", icon: LayoutDashboard }, { label: "Users", icon: Users }, { label: "Households", icon: Building2 }, { label: "Roles & access", icon: KeyRound }, { label: "System settings", icon: Settings }].map((item) => <button key={item.label} className={section === item.label ? "active" : ""} onClick={() => setSection(item.label)}><item.icon size={18} />{item.label}</button>)}</nav><div className="admin-note"><ShieldCheck size={20} /><strong>Administrator mode</strong><p>Admin accounts manage the system and never participate in Household balances.</p></div><Link href="/">Exit admin console</Link></aside><section className="admin-main"><header><div><p className="eyebrow">SYSTEM MANAGEMENT</p><h1>{section}</h1><p>Manage accounts, access, and Household membership.</p></div><button className="primary-button"><Plus size={17} /> Create {section === "Households" ? "Household" : "user"}</button></header>{section === "Users" ? <><div className="admin-stats"><div><span className="stat-icon mint"><Users size={19} /></span><span><small>TOTAL USERS</small><strong>12</strong></span></div><div><span className="stat-icon blue"><UserCog size={19} /></span><span><small>ACTIVE</small><strong>11</strong></span></div><div><span className="stat-icon yellow"><AlertTriangle size={19} /></span><span><small>DISABLED</small><strong>1</strong></span></div></div><div className="admin-table-card"><div className="admin-toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search by name or email" /></div><button className="secondary-button">All statuses</button></div><div className="admin-table"><div className="admin-table-head"><span>User</span><span>Household access</span><span>Status</span><span>Role</span><span /></div>{accounts.map((user) => <button key={user.email}><span className="admin-user"><span className={`avatar ${user.color} small`}>{user.initials}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></span><span>{user.households}</span><span className={`status-pill ${user.status === "Active" ? "done" : "open"}`}>{user.status}</span><span>Member</span><MoreHorizontal size={17} /></button>)}</div></div></> : <AdminPlaceholder section={section} />}</section></main>;
}

function AdminPlaceholder({ section }: { section: string }) {
  return <div className="admin-placeholder"><span className="setup-icon"><ShieldCheck size={24} /></span><h2>{section}</h2><p>This protected management surface keeps system administration separate from Household financial activity.</p><button className="secondary-button">Open management view <ChevronRight size={16} /></button></div>;
}
