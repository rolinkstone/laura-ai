/**
 * Uji koneksi provider Gemini (membaca GEMINI_API_KEY & GEMINI_MODEL dari .env).
 * Jalankan: node src/scripts/testGemini.js
 */
require('dotenv').config();
const gemini = require('../services/ai/gemini.provider');

(async () => {
  console.log('Model  :', gemini.chat ? process.env.GEMINI_MODEL : '-');
  console.log('Key set:', process.env.GEMINI_API_KEY ? '✓ ya' : '✗ belum');
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ GEMINI_API_KEY kosong');
    process.exit(1);
  }

  try {
    const result = await gemini.chat({
      system: 'Anda asisten uji singkat.',
      user: 'Balas hanya dengan kata: OK'
    });
    console.log('✅ Berhasil terhubung ke Gemini');
    console.log('   Model   :', result.model);
    console.log('   Tokens  :', result.tokensUsed);
    console.log('   Jawaban :', result.text.trim());
  } catch (err) {
    console.error('❌ Gagal terhubung:', err.message);
    process.exitCode = 1;
  }
})();
