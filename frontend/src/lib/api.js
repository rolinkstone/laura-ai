export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005/api';

const TOKEN_KEY = 'bbpom_token';
const SESSION_KEY = 'bbpom_public_session';
const HISTORY_KEY = 'bbpom_public_history';

// ============ Token / Sesi ============
export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Ambil role user dari JWT aplikasi yang tersimpan (payload berisi `role`).
 * Tanpa verifikasi — hanya untuk keperluan UI (gating menu/halaman).
 */
export function getUserRole() {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json).role || null;
  } catch {
    return null;
  }
}

export function getSessionId() {
  if (typeof window === 'undefined') return null;
  const id = localStorage.getItem(SESSION_KEY);
  // Lindungi dari nilai sisa korup ("null", "undefined", dll) yang pernah
  // tersimpan via String(null) — kalau terkirim, backend akan tolak validasi.
  if (!id || id === 'null' || id === 'undefined') return null;
  return id;
}
export function setSessionId(id) {
  if (id === null || id === undefined || id === '') {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, String(id));
}

/**
 * Tukar access token Keycloak → JWT aplikasi + user lokal.
 * Dipakai setelah login SSO (NextAuth) sebelum memakai API.
 */
export async function keycloakExchange(token) {
  return api('/auth/keycloak', { method: 'POST', body: { token } });
}

// Riwayat chat publik (localStorage, per browser)
export function getLocalHistory() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}
export function setLocalHistory(messages) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
}

// ============ API client ============

/**
 * Status proses pertukaran token ke Keycloak.
 * Dipakai untuk mencegah banyak request 401 memicu banyak pertukaran sekaligus.
 * @type {Promise<string|null>|null}
 */
let exchangePromise = null;
/** Apakah sudah pernah mencoba memulihkan di siklus hidup ini (anti jejak gagal). */
let recoveryAttempted = false;

/**
 * Hitung kapan JWT aplikasi kedaluwarsa (epoch ms), atau null bila tak terbaca.
 * @param {string} token
 * @returns {number|null}
 */
export function getTokenExpiry(token) {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Token dianggap perlu diperbarui bila sisa umurnya < 2 menit. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/**
 * Perpanjang JWT aplikasi memakai token yang masih berlaku.
 * @returns {Promise<boolean>} true bila token baru berhasil disimpan
 */
async function refreshAppToken() {
  const current = getToken();
  if (!current) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${current}` }
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    if (!data.token) return false;
    setToken(data.token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tukar sesi Keycloak (NextAuth) menjadi JWT aplikasi baru.
 * Dipakai saat JWT aplikasi sudah kedaluwarsa tetapi sesi SSO masih ada.
 * `getSession` diimpor dinamis karena lib ini juga dipakai halaman publik.
 * @returns {Promise<string|null>} JWT baru atau null
 */
async function exchangeKeycloakSession() {
  if (exchangePromise) return exchangePromise;

  exchangePromise = (async () => {
    try {
      const { getSession } = await import('next-auth/react');
      const session = await getSession();
      if (!session?.accessToken) return null;
      const data = await keycloakExchange(session.accessToken);
      if (!data?.token) return null;
      setToken(data.token);
      return data.token;
    } catch {
      return null;
    } finally {
      exchangePromise = null;
    }
  })();

  return exchangePromise;
}

/**
 * Pulihkan sesi tanpa memaksa pengguna melihat error.
 * Urutan: (1) refresh JWT berjalan, (2) tukar ulang dari sesi Keycloak.
 * @returns {Promise<string|null>} token baru bila berhasil
 */
export async function recoverSession() {
  if (recoveryAttempted) return null;
  recoveryAttempted = true;
  try {
    if (await refreshAppToken()) return getToken();
    return await exchangeKeycloakSession();
  } finally {
    // Beri kesempatan lagi pada siklus berikutnya (mis. setelah login ulang)
    setTimeout(() => {
      recoveryAttempted = false;
    }, 15000);
  }
}

/**
 * Panggil API. Bila server menjawab 401 (token aplikasi kedaluwarsa),
 * token diperbarui otomatis lalu request diulang SEKALI.
 *
 * @param {string} path
 * @param {{method?: string, body?: any, token?: string, isForm?: boolean, retry?: boolean}} opsi
 */
export async function api(path, { method = 'GET', body, token, isForm, retry = true } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));

  // Token kedaluwarsa → pulihkan lalu ulangi sekali dengan token baru.
  // Hanya untuk request yang membawa token; request publik dibiarkan gagal apa adanya.
  if (res.status === 401 && token && retry) {
    const fresh = await recoverSession();
    if (fresh) {
      return api(path, { method, body, token: fresh, isForm, retry: false });
    }
  }

  if (!res.ok) {
    const err = new Error(data.message || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Unduh file dari API lalu simpan di komputer pengguna.
 * Endpoint unduhan butuh header Authorization, jadi tidak bisa memakai
 * <a href> biasa — file diambil sebagai blob dulu, baru di-trigger.
 *
 * @param {string} path mis. `/documents/12/file`
 * @param {{token?: string, filename?: string}} opsi nama file simpanan
 * @returns {Promise<string>} nama file yang dipakai
 */
export async function downloadFile(path, { token, filename, retry = true } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers });

  // Token kedaluwarsa saat mengunduh → pulihkan lalu ulangi sekali.
  if (res.status === 401 && token && retry) {
    const fresh = await recoverSession();
    if (fresh) return downloadFile(path, { token: fresh, filename, retry: false });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.message || `Gagal mengunduh file (${res.status})`);
    err.status = res.status;
    throw err;
  }

  // Pakai nama dari Content-Disposition bila ada (butuh exposedHeaders di CORS)
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = filename || (match ? decodeURIComponent(match[1]) : 'dokumen.pdf');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return name;
}

// ============ Streaming (SSE) ============
// path default: /public/chat/stream (chat publik tanpa login)
export async function streamChat({
  question,
  sessionId,
  path = '/public/chat/stream',
  token,
  onEvent,
  timeoutMs = 90000,
  signal,
  retry = true
}) {
  // Token sesi hampir/sudah habis → perbarui dulu supaya streaming tidak
  // gagal di tengah jalan dengan pesan "token kedaluwarsa".
  const exp = getTokenExpiry(token);
  if (token && exp && exp - Date.now() < REFRESH_MARGIN_MS) {
    const fresh = await refreshAppToken();
    if (fresh) token = getToken();
  }

  // Kirim session_id hanya kalau berupa angka valid. Nilai sisa localStorage
  // ('' / 'null' / 'undefined') akan ditolak validator backend dan membuat
  // pengguna melihat error padahal hanya perlu memulai sesi baru.
  const sid = sessionId === null || sessionId === undefined ? null : Number(sessionId);
  const safeSessionId = Number.isInteger(sid) && sid > 0 ? sid : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Dukung tombol "stop" dari luar (user membatalkan streaming)
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, session_id: safeSessionId }),
      signal: controller.signal
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));

      // Token kedaluwarsa → pulihkan lalu ulangi sekali.
      if (res.status === 401 && token && retry) {
        const fresh = await recoverSession();
        if (fresh) {
          return streamChat({
            question, sessionId, path, token: fresh, onEvent, timeoutMs, signal, retry: false
          });
        }
      }

      // Tampilkan field yang gagal validasi (jika ada) agar mudah dilacak
      const detail =
        Array.isArray(data.errors) && data.errors.length > 0
          ? ` — field: ${data.errors.map((e) => e.field || e.path).join(', ')}`
          : '';
      throw new Error(`${data.message || `Error ${res.status}`}${detail}`);
    }
    if (!res.body) throw new Error('Streaming tidak didukung');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            onEvent(JSON.parse(line.slice(5).trim()));
          } catch {
            // abaikan event tidak valid
          }
        }
      }
    }
  } catch (err) {
    if (controller.signal.aborted && timedOut) {
      throw new Error('Jawaban terlalu lama (timeout). Silakan coba lagi.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}
