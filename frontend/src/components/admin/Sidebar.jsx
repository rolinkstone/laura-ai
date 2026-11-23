'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  HelpCircle,
  FolderTree,
  Link2,
  Cpu,
  Blocks,
  History,
  ShieldCheck,
  LogOut,
  Sparkles
} from 'lucide-react';
import { logoutSSO } from '../../lib/auth';
import { getUserRole } from '../../lib/api';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'Knowledge Base' },
  { href: '/admin/dokumen', label: 'Dokumen', icon: FileText },
  { href: '/admin/faq', label: 'FAQ', icon: HelpCircle },
  { href: '/admin/kategori', label: 'Kategori', icon: FolderTree },
  // Sumber = daftar link referensi + ruang lingkup pencarian web LAURA
  { href: '/admin/sumber', label: 'Sumber', icon: Link2 },
  { href: '/admin/integrasi-jk', label: 'Integrasi JK', icon: Blocks, adminOnly: true },
  { section: 'AI' },
  { href: '/admin/ai', label: 'Model & RAG', icon: Cpu, adminOnly: true },
  { section: 'Chat' },
  { href: '/admin/riwayat', label: 'Riwayat', icon: History },
  { section: 'Keamanan' },
  { href: '/admin/audit', label: 'Audit Log', icon: ShieldCheck, adminOnly: true }
];

export default function Sidebar() {
  const pathname = usePathname();
  const isAdmin = getUserRole() === 'admin';

  const logout = async () => {
    // Logout penuh: bersihkan JWT lokal + sesi NextAuth + Keycloak end_session
    await logoutSSO();
  };

  return (
    <aside className="flex w-14 shrink-0 flex-col bg-slate-900 text-slate-300 lg:w-60">
      <div className="flex items-center gap-2 border-b border-slate-800 px-2 py-5 lg:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Sparkles size={18} />
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold leading-tight text-white">BBPOM AI</p>
          <p className="text-[11px] text-slate-400">{isAdmin ? 'Admin Console' : 'Panel Pengguna'}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4 lg:px-3">
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item, i) =>
          item.section ? (
            <p
              key={i}
              className="hidden px-2 pb-1 pt-4 text-[11px] uppercase tracking-wider text-slate-500 lg:block"
            >
              {item.section}
            </p>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition lg:justify-start ${
                pathname === item.href
                  ? 'bg-brand-600 text-white'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={17} className="shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          )
        )}
      </nav>

      <div className="border-t border-slate-800 p-2 lg:p-3">
        <button
          onClick={logout}
          title="Keluar"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-800 hover:text-white lg:justify-start"
        >
          <LogOut size={17} className="shrink-0" />
          <span className="hidden lg:inline">Keluar</span>
        </button>
      </div>
    </aside>
  );
}
