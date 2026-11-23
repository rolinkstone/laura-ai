/**
 * NAMA COOKIE NEXTAUTH — DIPISAH PER APLIKASI
 * ------------------------------------------
 * Cookie browser dipisahkan berdasarkan HOST, bukan PORT. Jadi dua aplikasi
 * NextAuth di mesin yang sama (mis. LAURA di localhost:3006 dan Jendela Kinerja
 * di localhost:3007) memakai cookie yang SAMA (`next-auth.session-token`) bila
 * namanya default. Akibatnya login di satu aplikasi menimpa cookie sesi aplikasi
 * lain, dan aplikasi yang tertimpa langsung terlempar ke /login.
 *
 * Solusi: setiap aplikasi memakai awalan nama cookie sendiri. Awalan diatur
 * lewat AUTH_COOKIE_PREFIX (default 'laura'), sehingga di server pun bisa
 * dibedakan tanpa mengubah kode.
 */

/** Awalan nama cookie aplikasi ini. */
export const AWALAN_COOKIE = process.env.AUTH_COOKIE_PREFIX || 'laura';

/** Cookie `__Secure-` hanya untuk HTTPS; di http://localhost harus mati. */
export const PAKAI_COOKIE_AMAN = (process.env.NEXTAUTH_URL || '').startsWith('https');

const awalanAman = PAKAI_COOKIE_AMAN ? '__Secure-' : '';

/** Opsi dasar semua cookie sesi. */
const dasar = { path: '/', sameSite: 'lax', secure: PAKAI_COOKIE_AMAN };

/** Konfigurasi cookie untuk NextAuth (dipakai di authOptions.cookies). */
export const authCookies = {
  sessionToken: {
    name: `${awalanAman}${AWALAN_COOKIE}.session-token`,
    options: { ...dasar, httpOnly: true }
  },
  callbackUrl: {
    name: `${AWALAN_COOKIE}.callback-url`,
    options: { ...dasar }
  },
  csrfToken: {
    name: `${awalanAman}${AWALAN_COOKIE}.csrf-token`,
    options: { ...dasar, httpOnly: true }
  },
  pkceCodeVerifier: {
    name: `${AWALAN_COOKIE}.pkce.code_verifier`,
    options: { ...dasar, httpOnly: true, maxAge: 900 }
  },
  state: {
    name: `${AWALAN_COOKIE}.state`,
    options: { ...dasar, httpOnly: true, maxAge: 900 }
  },
  nonce: {
    name: `${awalanAman}${AWALAN_COOKIE}.nonce`,
    options: { ...dasar, httpOnly: true }
  }
};

/** Nama cookie sesi — dipakai bila server perlu membaca cookie secara manual. */
export const NAMA_COOKIE_SESI = authCookies.sessionToken.name;
