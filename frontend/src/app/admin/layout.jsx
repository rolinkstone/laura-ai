'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Sidebar from '../../components/admin/Sidebar';
import { getToken, setToken, keycloakExchange } from '../../lib/api';
import { logoutSSO } from '../../lib/auth';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const { status, data: session } = useSession();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Sudah punya JWT aplikasi → langsung tampil
    const localToken = getToken();
    if (localToken) {
      setReady(true);
      return;
    }

    // Menunggu NextAuth menentukan status sesi
    if (status === 'loading') return;

    // Login via Keycloak → tukar access token menjadi JWT aplikasi
    if (status === 'authenticated' && session?.accessToken) {
      keycloakExchange(session.accessToken)
        .then((res) => {
          setToken(res.token);
          setReady(true);
        })
        .catch((err) => setError(err.message));
      return;
    }

    // Tidak ada token & tidak login → ke halaman login
    router.replace('/login');
  }, [status, session, router]);

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-5 py-4 text-sm max-w-md text-center">
          Gagal menghubungkan sesi Keycloak ke backend: {error}
        </div>
        <button
          onClick={() => logoutSSO()}
          className="text-sm text-slate-600 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50"
        >
          Keluar & coba lagi
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-400 text-sm">
        Memeriksa autentikasi...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
