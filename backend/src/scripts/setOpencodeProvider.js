/**
 * Sinkronkan pengaturan LLM di DB agar sesuai provider baru: opencode (utama) + gemini.
 * Jalankan: node src/scripts/setOpencodeProvider.js
 */
const { setSetting, getAllSettings } = require('../services/settingsService');

(async () => {
  await setSetting('ai_provider', 'opencode,gemini');
  // Model opencode = MiMo-V2.5 Free (gratis, NON-reasoning → cepat)
  await setSetting('opencode_model', 'mimo-v2.5-free');
  // Model gemini = sesuaikan dengan .env (GEMINI_MODEL=gemini-3.6-flash)
  await setSetting('gemini_model', 'gemini-3.6-flash');
  // Bersihkan sisa pengaturan provider lama (openai/deepseek) supaya tidak mengganggu
  await setSetting('openai_api_key', '');
  await setSetting('openai_model', '');
  await setSetting('deepseek_api_key', '');
  await setSetting('deepseek_model', '');

  const all = await getAllSettings();
  console.log('Settings DB saat ini:');
  for (const [k, v] of Object.entries(all)) {
    if (/provider|model|api_key|enabled/.test(k)) console.log(`  ${k} = ${v}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('Gagal:', e.message);
  process.exit(1);
});
