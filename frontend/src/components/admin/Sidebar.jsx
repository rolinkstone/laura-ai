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
  History,
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
  { href: '/admin/sumber', label: 'Sumber', icon: Link2 },
  { section: 'AI' },
  { href: '/admin/ai', label: 'Model & RAG', icon: Cpu, adminOnly: true },
  { section: 'Chat' },
  { href: '/admin/riwayat', label: 'Riwayat', icon: History }
];

export default function Sidebar() {
  const pathname = usePathname();
  const isAdmin = getUserRole() === 'admin';

  const logout = async () => {
    // Logout penuh: bersihkan JWT lokal + sesi NextAuth + Keycloak end_session
    await logoutSSO();
  };

  return (
    <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col shrink-0">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
        <div className="h-9 w-9 rounded-lg bg-brand-600 text-white flex items-center justify-center">
          <Sparkles size={18} />
        </div>
        <div>
          <p className="font-semibold text-white text-sm leading-tight">BBPOM AI</p>
          <p className="text-[11px] text-slate-400">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item, i) =>
          item.section ? (
            <p key={i} className="px-2 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-500">
              {item.section}
            </p>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                pathname === item.href
                  ? 'bg-brand-600 text-white'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          )
        )}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-slate-800 hover:text-white transition"
        >
          <LogOut size={17} />
          Keluar
        </button>
      </div>
    </aside>
  );
}
