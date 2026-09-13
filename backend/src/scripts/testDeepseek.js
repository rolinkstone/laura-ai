/**
 * Uji koneksi provider DeepSeek (membaca DEEPSEEK_API_KEY & DEEPSEEK_MODEL dari .env).
 * Tidak menampilkan API key.
 * Jalankan: node src/scripts/testDeepseek.js
 */
require('dotenv').config();
const deepseek = require('../services/ai/deepseek.provider');

(async () => {
  console.log('Model  :', process.env.DEEPSEEK_MODEL);
  console.log('Key set:', process.env.DEEPSEEK_API_KEY ? '✓ ya' : '✗ belum');
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('❌ DEEPSEEK_API_KEY kosong');
    process.exit(1);
  }

  try {
    const result = await deepseek.chat({
      system: 'Anda asisten uji singkat.',
      user: 'Balas hanya dengan kata: OK'
    });
    console.log('✅ Berhasil terhubung ke DeepSeek');
    console.log('   Model   :', result.model);
    console.log('   Tokens  :', result.tokensUsed);
    console.log('   Jawaban :', result.text.trim());
  } catch (err) {
    console.error('❌ Gagal terhubung:', err.message);
    process.exitCode = 1;
  }
})();
