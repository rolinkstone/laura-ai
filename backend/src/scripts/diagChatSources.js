/**
 * Diagnosa sementara: lihat sumber yang benar-benar dipakai LAURA untuk sebuah
 * kata kunci pertanyaan (mis. nomor registrasi).
 *
 * Jalankan: node src/scripts/diagChatSources.js GKL1713713144A1
 */

require('dotenv').config();
const { pool } = require('../config/db');

const keyword = process.argv[2] || 'GKL1713713144A1';

(async () => {
  try {
    const [rows] = await pool.query(
      `SELECT id, role, LEFT(content, 140) AS cuplikan, sources::text AS sumber, created_at
         FROM chat_messages
        WHERE content ILIKE ?
        ORDER BY id DESC LIMIT 3`,
      [`%${keyword}%`]
    );

    if (rows.length === 0) {
      console.log(`Tidak ada pesan yang memuat "${keyword}".`);
      return;
    }

    for (const row of rows) {
      console.log('---');
      console.log(`id ${row.id} [${row.role}] ${row.created_at}`);
      console.log(`cuplikan: ${row.cuplikan}`);
      console.log(`sources : ${(row.sumber || '-').slice(0, 900)}`);
    }
  } catch (err) {
    console.log('ERR:', err.message);
  } finally {
    await pool.end();
  }
})();
