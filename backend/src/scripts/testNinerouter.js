/**
 * Uji provider 9Router langsung (tanpa server) — chat & streaming.
 * Jalankan: node src/scripts/testNinerouter.js
 */
require('dotenv').config();
const ninerouterProvider = require('../services/ai/ninerouter.provider');
const llmConfig = require('../services/llmConfigService');

(async () => {
  console.log('Provider :', 'ninerouter');
  console.log('Model    :', llmConfig.getModel('ninerouter'));
  console.log('Key set  :', llmConfig.getApiKey('ninerouter') ? '✓ ya' : '✗ belum');
  console.log('Base URL :', process.env.NINEROUTER_BASE_URL || 'http://localhost:20128/v1');
  console.log('---');

  if (!llmConfig.getApiKey('ninerouter')) {
    console.log('❌ NINEROUTER_API_KEY kosong — isi di .env atau dashboard AI');
    process.exit(1);
  }

  // Uji chat() non-streaming (membaca SSE)
  const t0 = Date.now();
  try {
    const res = await ninerouterProvider.chat({
      system: 'Anda adalah asisten uji.',
      user: 'Balas singkat: halo, uji 9Router OK?'
    });
    console.log(`✅ chat() OK dalam ${Date.now() - t0} ms`);
    console.log('   Jawaban:', res.text);
    console.log('   Model  :', res.model, '| tokens:', res.tokensUsed);
  } catch (err) {
    console.log('❌ chat() gagal:', err.message);
    process.exit(1);
  }

  // Uji streamTokens() streaming
  const t1 = Date.now();
  let out = '';
  try {
    for await (const tok of ninerouterProvider.streamTokens({
      system: 'Anda adalah asisten uji.',
      user: 'Balas singkat: uji streaming'
    })) {
      out += tok;
    }
    console.log(`✅ streamTokens() OK dalam ${Date.now() - t1} ms`);
    console.log('   Jawaban:', out);
  } catch (err) {
    console.log('❌ streamTokens() gagal:', err.message);
  }

  process.exit(0);
})();
