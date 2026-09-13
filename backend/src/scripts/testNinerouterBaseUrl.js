/**
 * Uji simpan base URL via updateConfig (simulasi simpan dari dashboard) + verifikasi.
 * Jalankan: node src/scripts/testNinerouterBaseUrl.js
 */
require('dotenv').config();
const llmConfig = require('../services/llmConfigService');
const ninerouterProvider = require('../services/ai/ninerouter.provider');

(async () => {
  await llmConfig.loadConfig();
  console.log('baseUrl (sebelum):', llmConfig.getPublicConfig().baseUrl);

  // Simulasi simpan dari dashboard — set base URL production
  await llmConfig.updateConfig({
    ninerouter_base_url: 'https://router.bbpompky.id/v1'
  });

  const pub = llmConfig.getPublicConfig();
  console.log('baseUrl (setelah updateConfig):', pub.baseUrl);
  console.log('provider getBaseUrl :', ninerouterProvider.name, '->');

  // Uji chat singkat untuk pastikan provider pakai base URL dari config
  const t0 = Date.now();
  try {
    const res = await ninerouterProvider.chat({
      system: 'Anda asisten uji.',
      user: 'Balas singkat: OK'
    });
    console.log(`✅ chat OK (${Date.now() - t0} ms):`, res.text.slice(0, 60));
  } catch (err) {
    console.log('❌ chat gagal:', err.message);
    process.exit(1);
  }

  process.exit(0);
})();
