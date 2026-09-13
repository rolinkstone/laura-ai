const rateLimit = require('express-rate-limit');

/**
 * Rate limiter untuk endpoint autentikasi (login/register).
 * Mencegah brute-force password.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 30, // maksimal 30 request per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }
});

/**
 * Rate limiter untuk chat (RAG).
 * Mencegah penyalahgunaan API AI.
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 60, // maksimal 60 request per menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan. Silakan tunggu sebentar.' }
});

/**
 * Rate limiter untuk upload dokumen.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak upload. Coba lagi nanti.' }
});

module.exports = { authLimiter, chatLimiter, uploadLimiter };
