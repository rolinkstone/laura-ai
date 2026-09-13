/**
 * Uji koneksi provider OpenCode (membaca OPENCODE_API_KEY/MODEL/BASE_URL dari .env).
 * Tidak menampilkan API key.
 * Jalankan: node src/scripts/testOpencode.js
 */
require('dotenv').config();
const provider = require('../services/ai/opencode.provider');

(async () => {
  console.log('Base URL :', process.env.OPENCODE_BASE_URL || 'https://api.opencode.ai/v1');
  console.log('Model    :', process.env.OPENCODE_MODEL || 'opencode-1.5-sonnet');
  console.log('Key set  :', process.env.OPENCODE_API_KEY ? '✓ ya' : '✗ belum');
  if (!process.env.OPENCODE_API_KEY) {
    console.log('❌ OPENCODE_API_KEY kosong');
    process.exit(1);
  }

  try {
    const result = await provider.chat({
      system: 'Anda asisten uji singkat.',
      user: 'Balas hanya dengan kata: OK'
    });
    console.log('✅ Berhasil terhubung ke OpenCode');
    console.log('   Model   :', result.model);
    console.log('   Tokens  :', result.tokensUsed);
    console.log('   Jawaban :', result.text.trim());
  } catch (err) {
    console.error('❌ Gagal terhubung:', err.message);
    process.exitCode = 1;
  }
})();
