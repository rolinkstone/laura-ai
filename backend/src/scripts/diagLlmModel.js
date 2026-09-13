/**
 * Diagnosa: kenapa model yang diubah di dashboard tidak "muncul" di 9Router?
 *
 * Menampilkan berurutan:
 *   1. setelan LLM yang tersimpan di tabel `settings`
 *   2. nilai di .env
 *   3. konfigurasi efektif yang dipakai kode (llmConfigService)
 *   4. BUKTI: request yang benar-benar dikirim ke gateway (URL + field `model`)
 *
 * Jalankan: node src/scripts/diagLlmModel.js
 */

require('dotenv').config();
const { pool } = require('../config/db');
const llmConfig = require('../services/llmConfigService');

(async () => {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM settings
      WHERE setting_key LIKE 'ninerouter%' OR setting_key LIKE 'llm%' OR setting_key LIKE 'ai_%'
      ORDER BY setting_key`
  );

  console.log('=== 1) settings (DB) ===');
  if (rows.length === 0) console.log(' (kosong — belum pernah disimpan dari dashboard)');
  rows.forEach((r) =>
    console.log(`  ${r.setting_key} = ${r.setting_value === null ? '(NULL)' : JSON.stringify(r.setting_value)}`)
  );

  console.log('\n=== 2) .env ===');
  console.log('  NINEROUTER_MODEL    =', process.env.NINEROUTER_MODEL || '(kosong)');
  console.log('  NINEROUTER_BASE_URL =', process.env.NINEROUTER_BASE_URL || '(kosong, default http://localhost:20128/v1)');
  console.log('  NINEROUTER_API_KEY  =', process.env.NINEROUTER_API_KEY ? '(terisi)' : '(kosong)');

  await llmConfig.loadConfig();
  console.log('\n=== 3) konfigurasi efektif (yang dipakai kode) ===');
  console.log(JSON.stringify(llmConfig.getPublicConfig(), null, 1));

  console.log('\n=== 4) request yang BENAR-BENAR dikirim ke gateway ===');
  const originalFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    let model = null;
    try {
      model = JSON.parse(opts.body || '{}').model;
    } catch {
      model = '(body tidak bisa dibaca)';
    }
    console.log(`  >>> POST ${url}`);
    console.log(`      model  = ${model}`);
    console.log(`      auth   = ${opts.headers?.Authorization ? 'Bearer ***' : '(TANPA Authorization)'}`);
    const res = await originalFetch(url, opts);
    console.log(`  <<< HTTP ${res.status} ${res.statusText}`);
    return res;
  };

  try {
    const provider = require('../services/ai/ninerouter.provider');
    const out = await provider.chat({ system: 'Balas satu kata saja.', user: 'ping', maxTokens: 10, timeoutMs: 30000 });
    console.log(`      jawaban       = ${JSON.stringify(String(out.text).slice(0, 60))}`);
    console.log(`      model(laporan)= ${out.model}`);
  } catch (err) {
    console.log(`      GAGAL: ${String(err.message).slice(0, 240)}`);
  } finally {
    global.fetch = originalFetch;
  }

  await pool.end();
})();
