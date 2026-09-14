const { pool } = require('../config/db');

/**
 * Riwayat percakapan sesi chat.
 *
 * Dipakai agar jawaban LAURA nyambung dengan konteks pertanyaan sebelumnya,
 * mis. pengguna menulis "roti tawar dan produk bakery" lalu menimpali dengan
 * "kue kering cookies" — pertanyaan lanjutan seperti ini tidak bisa dijawab
 * bila riwayat percakapan tidak dikirim ke LLM.
 *
 * SUMBER riwayat = tabel `chat_messages` (bukan dari klien), supaya jawaban
 * asisten yang sudah tersimpan (termasuk sitasinya) ikut menjadi konteks dan
 * klien tidak bisa memalsukan percakapan.
 */

// Jumlah pesan terakhir yang dijadikan konteks (user + assistant).
const DEFAULT_TURNS = Number(process.env.CHAT_HISTORY_TURNS) || 6;
// Batas panjang tiap pesan agar prompt tidak membengkak oleh jawaban panjang.
const MAX_CHARS = Number(process.env.CHAT_HISTORY_MAX_CHARS) || 1200;

const normalizeRole = (role) => (role === 'assistant' ? 'assistant' : 'user');

const clip = (text) => {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > MAX_CHARS ? `${clean.slice(0, MAX_CHARS)}…` : clean;
};

/**
 * Ambil beberapa pesan terakhir sebuah sesi (urut lama → baru).
 *
 * @param {number|string|null} sessionId
 * @param {number} [limit] jumlah pesan (bukan pasangan tanya-jawab)
 * @returns {Promise<Array<{role: 'user'|'assistant', content: string}>>}
 */
const getRecentHistory = async (sessionId, limit = DEFAULT_TURNS) => {
  if (!sessionId) return [];

  const take = Math.min(Math.max(Number(limit) || DEFAULT_TURNS, 0), 20);
  if (take === 0) return [];

  const [rows] = await pool.query(
    `SELECT "role", content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ${take}`,
    [sessionId]
  );

  return rows
    .reverse()
    .map((r) => ({ role: normalizeRole(r.role), content: clip(r.content) }))
    .filter((m) => m.content.length > 0);
};

module.exports = { getRecentHistory, DEFAULT_TURNS, MAX_CHARS };
