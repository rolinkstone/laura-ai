const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * Pembatasan laju request (rate limit).
 *
 * Kunci pembatas: JENIS + IDENTITAS.
 *  - Bila request sudah terautentikasi (`req.user.id` tersedia), kunci memakai
 *    kombinasi jenis + user id. Ini mencegah dua masalah nyata:
 *      1. seluruh kantor keluar dari satu IP publik (NAT) sehingga kuota
 *         bersama habis oleh satu pengguna;
 *      2. penyerang cukup berpindah IP untuk mengakali batas.
 *  - Bila belum terautentikasi (login, chat publik), kunci memakai IP.
 *
 * PENTING (urutan pemasangan): limiter ini harus dipasang SETELAH middleware
 * `auth` pada route yang dilindungi, supaya `req.user` sudah terisi saat kunci
 * dibaca. Pada route publik `req.user` tidak ada -> otomatis kembali ke IP.
 */

/**
 * Kunci: jenis + user id bila login, selain itu jenis + IP.
 * @param {string} jenis label jenis limiter (auth/chat/upload/...)
 */
const makeKeyGenerator = (jenis) => (req) =>
  req.user && req.user.id
    ? `${jenis}:u${req.user.id}`
    : `${jenis}:ip${ipKeyGenerator(req.ip)}`;

/**
 * Opsi dasar bersama agar header & format pesan konsisten.
 * @param {string} jenis label jenis limiter
 * @param {string} pesan pesan yang dikirim saat batas terlampaui
 */
const baseOptions = (jenis, pesan) => ({
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(jenis),
  message: { success: false, message: pesan }
});

/**
 * Rate limiter untuk endpoint autentikasi (login/register).
 * Mencegah brute-force password. Kunci: IP (belum ada user).
 */
const authLimiter = rateLimit({
  ...baseOptions('auth', 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.'),
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 30
});

/**
 * Rate limiter untuk chat (RAG) - per user bila login, per IP bila anonim.
 * Mencegah penyalahgunaan API AI.
 */
const chatLimiter = rateLimit({
  ...baseOptions('chat', 'Terlalu banyak permintaan. Silakan tunggu sebentar.'),
  windowMs: 60 * 1000, // 1 menit
  max: 60
});

/**
 * Kuota harian endpoint AI per user (biaya token nyata).
 * Admin dikecualikan supaya tidak terkunci saat menguji model/scan gateway.
 * Atur batasnya lewat CHAT_DAILY_MAX di .env.
 */
const DAILY_CHAT_MAX = Number(process.env.CHAT_DAILY_MAX) || 300;
const chatDailyLimiter = rateLimit({
  ...baseOptions('chatdaily', `Kuota harian chat habis (${DAILY_CHAT_MAX} permintaan/hari). Coba lagi besok.`),
  windowMs: 24 * 60 * 60 * 1000,
  max: DAILY_CHAT_MAX,
  skip: (req) => req.user?.role_name === 'admin'
});

/**
 * Rate limiter untuk upload dokumen (per user bila login).
 */
const uploadLimiter = rateLimit({
  ...baseOptions('upload', 'Terlalu banyak upload. Coba lagi nanti.'),
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 50
});

module.exports = { authLimiter, chatLimiter, chatDailyLimiter, uploadLimiter, DAILY_CHAT_MAX };
