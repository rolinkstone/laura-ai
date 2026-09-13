/**
 * Diagnosa: cek log AI & pesan chat error.
 * Jalankan: node src/scripts/debugLogs.js
 */
require('dotenv').config();
const { pool } = require('../config/db');

(async () => {
  const [logs] = await pool.query(
    'SELECT id, model, prompt, duration_ms, status, error FROM ai_logs ORDER BY id DESC LIMIT 8'
  );
  console.log('=== AI LOGS TERAKHIR ===');
  for (const x of logs) {
    console.log(
      `#${x.id} | ${x.model} | ${(x.prompt || '').slice(0, 40)} | ${x.duration_ms}ms | ${x.status}` +
        (x.error ? ` | ERR: ${x.error.slice(0, 100)}` : '')
    );
  }

  const [msgs] = await pool.query(
    "SELECT id, session_id, \"role\", LEFT(content, 80) AS c FROM chat_messages WHERE content LIKE '%Validasi%' OR content LIKE '%⚠️%' ORDER BY id DESC LIMIT 5"
  );
  console.log('\n=== PESAN ERROR DI CHAT ===');
  for (const x of msgs) {
    console.log(`#${x.id} sesi ${x.session_id} [${x.role}] ${x.c}`);
  }

  await pool.end();
})();
