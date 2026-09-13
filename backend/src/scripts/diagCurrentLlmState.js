/**
 * Diagnosa status LLM saat ini + kenapa jawaban berakhir "not-configured".
 *
 * - menampilkan setelan aktif (enabled, model, baseUrl)
 * - menguji model aktif ke gateway (menangkap error aslinya)
 * - melihat log AI & jawaban terakhir yang gagal
 *
 * Jalankan: node src/scripts/diagCurrentLlmState.js
 */

require('dotenv').config();
const { pool } = require('../config/db');
const llmConfig = require('../services/llmConfigService');

(async () => {
  await llmConfig.loadConfig();

  console.log('=== Setelan aktif ===');
  console.log(`  LLM enabled : ${llmConfig.isEnabled()}`);
  console.log(`  model       : ${llmConfig.getModel('ninerouter')}`);
  console.log(`  baseUrl     : ${llmConfig.getBaseUrl('ninerouter')}`);
  console.log(`  api key     : ${llmConfig.getApiKey('ninerouter') ? '(terisi)' : '(KOSONG)'}`);

  console.log('\n=== Uji model aktif ke gateway ===');
  try {
    const provider = require('../services/ai/ninerouter.provider');
    const out = await provider.chat({ system: 'Balas satu kata.', user: 'ping', maxTokens: 8, timeoutMs: 20000 });
    console.log(`  OK → "${String(out.text).slice(0, 40)}" (model: ${out.model})`);
  } catch (err) {
    console.log(`  GAGAL → ${String(err.message).replace(/\s+/g, ' ').slice(0, 260)}`);
  }

  console.log('\n=== 5 log AI terakhir ===');
  const [logs] = await pool.query(
    'SELECT id, model, status, duration_ms, created_at FROM ai_logs ORDER BY id DESC LIMIT 5'
  );
  logs.forEach((l) => console.log(`  #${l.id} ${l.created_at} | model=${l.model} | ${l.status} | ${l.duration_ms} ms`));

  console.log('\n=== 3 jawaban asisten terakhir (140 karakter pertama) ===');
  const [msgs] = await pool.query(
    `SELECT id, created_at, LEFT(content, 140) AS head FROM chat_messages
      WHERE role = 'assistant' ORDER BY id DESC LIMIT 3`
  );
  msgs.forEach((m) => console.log(`  #${m.id} ${m.created_at}\n    ${String(m.head).replace(/\s+/g, ' ')}`));

  await pool.end();
})();
