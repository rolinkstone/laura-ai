'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { Sparkles, KeyRound, LogOut } from 'lucide-react';
import { logoutSSO } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { status, data: session } = useSession();

  // Sudah login via Keycloak? langsung lanjut (admin layout akan tukar token)
  if (status === 'authenticated' && session?.accessToken) {
    router.replace('/admin');
  }

  const ssoLogin = () => signIn('keycloak', { callbackUrl: '/admin' });
  const ssoLogout = () => logoutSSO();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center mb-3">
              <Sparkles size={28} />
            </div>
            <h1 className="font-bold text-xl text-slate-900">BBPOM AI</h1>
            <p className="text-sm text-slate-500 mt-1">Masuk ke Admin Console</p>
          </div>

          {status === 'authenticated' ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-slate-600">
                Sesi SSO aktif sebagai{' '}
                <span className="font-medium">{session?.user?.name || session?.username || 'pengguna'}</span>
              </p>
              <button
                onClick={() => router.replace('/admin')}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-slate-800 transition"
              >
                Lanjut ke Dashboard
              </button>
              <button
                onClick={ssoLogout}
                className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-600 transition"
              >
                <LogOut size={14} /> Keluar dari sesi ini
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-sm text-slate-500">
                Gunakan akun institusi (Keycloak) untuk mengakses dashboard.
              </p>
              <button
                onClick={ssoLogin}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition"
              >
                <KeyRound size={18} />
                Masuk dengan Keycloak (SSO)
              </button>
              <p className="text-center text-xs text-slate-400">
                Anda akan diarahkan ke halaman login SSO institusi.
              </p>
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-8">
            Kembali ke{' '}
            <Link href="/" className="text-brand-600 hover:underline">
              chat publik
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
