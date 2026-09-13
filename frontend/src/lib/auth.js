import { getSession, signOut } from 'next-auth/react';
import { clearToken, setSessionId, setLocalHistory } from './api';

/**
 * Logout penuh (SSO Keycloak):
 *  1. Bersihkan semua state lokal (JWT aplikasi, sesi chat, riwayat)
 *  2. Keluar dari sesi NextAuth (hapus cookie)
 *  3. Redirect ke Keycloak end_session dengan id_token_hint
 *     agar sesi & token Keycloak ikut dimusnahkan.
 */
export async function logoutSSO() {
  // 1) Bersihkan state lokal
  clearToken();
  setSessionId(null);
  setLocalHistory([]);

  // 2) Ambil id_token untuk memusnahkan sesi Keycloak
  let idToken = null;
  try {
    const session = await getSession();
    idToken = session?.idToken || null;
  } catch {
    idToken = null;
  }

  // 3) Keluar dari NextAuth tanpa redirect dulu
  await signOut({ redirect: false });

  // 4) Redirect ke Keycloak end_session
  const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER;
  const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;

  if (issuer && typeof window !== 'undefined') {
    const params = new URLSearchParams();
    if (idToken) params.set('id_token_hint', idToken);
    params.set('client_id', clientId || '');
    params.set('post_logout_redirect_uri', `${window.location.origin}/login`);
    window.location.assign(`${issuer}/protocol/openid-connect/logout?${params.toString()}`);
  } else {
    window.location.assign('/login');
  }
}
