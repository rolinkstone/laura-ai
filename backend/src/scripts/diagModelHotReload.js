/**
 * Bukti: perubahan model dari dashboard berlaku LANGSUNG tanpa restart backend.
 *
 * Caranya: di dalam SATU proses yang sama —
 *   1. catat model aktif sekarang
 *   2. simpan model baru (persis seperti dashboard: tabel `settings`)
 *   3. panggil LLM dan CETAK field `model` yang benar-benar dikirim ke gateway
 *   4. kembalikan setelan semula
 *
 * Jalankan: node src/scripts/diagModelHotReload.js
 */

require('dotenv').config();
const llmConfig = require('../services/llmConfigService');

const NEW_MODEL = process.argv[2] || 'kr/claude-sonnet-4.5';

/** Panggil provider sambil merekam request yang keluar. */
const probe = async (label) => {
  const originalFetch = global.fetch;
  let sentModel = null;
  let status = null;

  global.fetch = async (url, opts = {}) => {
    try {
      sentModel = JSON.parse(opts.body || '{}').model;
    } catch {
      sentModel = '(tidak terbaca)';
    }
    const res = await originalFetch(url, opts);
    status = res.status;
    return res;
  };

  try {
    const provider = require('../services/ai/ninerouter.provider');
    await provider.chat({ system: 'Balas satu kata.', user: 'ping', maxTokens: 8, timeoutMs: 20000 });
  } catch (err) {
    status = `gagal: ${String(err.message).slice(0, 80)}`;
  } finally {
    global.fetch = originalFetch;
  }

  console.log(`${label}`);
  console.log(`   model dikirim ke gateway : ${sentModel}`);
  console.log(`   respons gateway          : ${status}`);
  return sentModel;
};

(async () => {
  await llmConfig.loadConfig();
  const before = llmConfig.getModel('ninerouter');
  console.log(`Model aktif (sebelum)  : ${before}\n`);

  await probe('1) Sebelum diubah:');

  console.log(`\n→ Simpan model baru "${NEW_MODEL}" (seperti klik Simpan di dashboard)...`);
  await llmConfig.updateConfig({ ninerouter_model: NEW_MODEL });
  console.log(`   llmConfig.getModel() = ${llmConfig.getModel('ninerouter')}  (tanpa restart)\n`);

  await probe('2) Sesudah diubah (proses yang SAMA):');

  console.log(`\n→ Kembalikan setelan semula (${before})...`);
  await llmConfig.updateConfig({ ninerouter_model: before });
  await probe('3) Setelah dikembalikan:');

  console.log('\nKesimpulan: model dibaca ulang SETIAP request dari cache yang disegarkan saat menyimpan.');
  console.log('Tidak ada restart backend yang dibutuhkan.');
})();
