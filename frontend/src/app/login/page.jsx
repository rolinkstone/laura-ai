'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import {
  Sparkles,
  KeyRound,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Lock,
  FileSearch,
  MessageSquare,
  BadgeCheck
} from 'lucide-react';
import { logoutSSO } from '../../lib/auth';

// Sorotan layanan pada panel branding
const HIGHLIGHTS = [
  {
    icon: FileSearch,
    title: 'Telaah Regulasi',
    desc: 'Ringkasan peraturan dan dokumen secara cepat'
  },
  {
    icon: MessageSquare,
    title: 'Jawaban Bersumber',
    desc: 'Setiap jawaban dilengkapi rujukan halaman dokumen'
  },
  {
    icon: ShieldCheck,
    title: 'Akses Terpusat',
    desc: 'Single Sign-On institusi melalui Keycloak'
  }
];

export default function LoginPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const isAuthenticated = status === 'authenticated';
  const userName = session?.user?.name || session?.username || 'pengguna';

  // Host issuer Keycloak, ditampilkan sebagai penanda kepercayaan
  const issuerHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER).host;
    } catch {
      return 'auth.bbpompky.id';
    }
  })();

  // Sudah login via Keycloak? langsung lanjut (admin layout akan tukar token)
  useEffect(() => {
    if (isAuthenticated && session?.accessToken) {
      router.replace('/admin');
    }
  }, [isAuthenticated, session, router]);

  const ssoLogin = () => signIn('keycloak', { callbackUrl: '/admin' });
  const ssoLogout = () => logoutSSO();

  return (
    <div className="min-h-screen bg-navy-950 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ============ Panel branding (desktop) ============ */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy-900 via-navy-950 to-black p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-16 h-80 w-80 rounded-full bg-navy-500/25 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <img
              src="/images/icon.png"
              alt="Logo BPOM"
              className="h-12 w-12 rounded-xl bg-white/95 object-contain p-1"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold">BPOM di Palangka Raya</p>
              <p className="text-xs text-white/55">Balai Besar Pengawas Obat dan Makanan</p>
            </div>
          </div>

          <h1 className="mt-16 text-4xl font-bold leading-tight tracking-tight">
            LAURA <span className="text-brand-100">Assistant</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/65">
            Layanan AI untuk Ulasan Regulasi dan Analisis — akurat, cepat, dan terpercaya.
          </p>
          <p className="mt-6 text-sm font-medium text-brand-100">
            “Bantu Telaah, Perkuat Analisis.”
          </p>

          <ul className="mt-12 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon size={18} className="text-brand-100" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-white/55">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/35">
          © BPOM di Palangka Raya · Admin Console
        </p>
      </aside>

      {/* ============ Panel login ============ */}
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Branding ringkas (mobile) */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <img
              src="/images/icon.png"
              alt="Logo BPOM"
              className="h-11 w-11 rounded-xl bg-white object-contain p-1"
            />
            <div className="leading-tight">
              <p className="font-bold text-white">LAURA Assistant</p>
              <p className="text-xs text-white/55">BPOM di Palangka Raya</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-8 shadow-2xl shadow-black/30 sm:p-10">
            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Sparkles size={22} />
              </span>
              <div className="leading-tight">
                <h2 className="text-lg font-bold text-slate-900">Admin Console</h2>
                <p className="text-xs text-slate-500">Masuk untuk mengelola Knowledge Base</p>
              </div>
            </div>

            {isAuthenticated ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                  <BadgeCheck size={18} className="shrink-0 text-emerald-600" />
                  <div className="min-w-0 leading-tight">
                    <p className="text-sm font-semibold text-emerald-900">Sesi SSO sudah aktif</p>
                    <p className="truncate text-xs text-emerald-700">{userName}</p>
                  </div>
                </div>

                <button
                  onClick={() => router.replace('/admin')}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  Lanjut ke Dashboard
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </button>

                <button
                  onClick={ssoLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm text-slate-400 transition hover:text-slate-600"
                >
                  <LogOut size={14} /> Keluar dari sesi ini
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm leading-relaxed text-slate-600">
                  Gunakan akun institusi Anda untuk mengakses dashboard admin.
                </p>

                <button
                  onClick={ssoLogin}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  <KeyRound size={18} />
                  Masuk dengan Keycloak SSO
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </button>

                <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-500">
                  <Lock size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <p>
                    Anda akan diarahkan ke <span className="font-medium text-slate-600">{issuerHost}</span>.
                    Kredensial Anda dikelola Keycloak dan tidak pernah dikirim ke aplikasi ini.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-8 border-t border-slate-100 pt-5">
              <p className="text-center text-xs text-slate-400">
                Kembali ke{' '}
                <Link href="/" className="font-medium text-brand-600 transition hover:text-brand-700 hover:underline">
                  chat publik
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-white/35">
            Dilindungi Single Sign-On institusi · {issuerHost}
          </p>
        </div>
      </main>
    </div>
  );
}
