/**
 * Uji pipeline RAG penuh via provider 9Router (embedding → vector search → LLM).
 * Jalankan: node src/scripts/testRagNinerouter.js "pertanyaan"
 */
require('dotenv').config();
const { ask } = require('../services/ai/ai.service');

(async () => {
  const question = process.argv[2] || 'Bagaimana cara melakukan pengaduan?';
  const t0 = Date.now();
  try {
    const res = await ask({ question });
    console.log('Pertanyaan:', question);
    console.log('Waktu    :', Date.now() - t0, 'ms');
    console.log('Model    :', res.modelUsed, '| provider:', res.provider);
    console.log('Sources  :', res.sources.length);
    console.log('Jawaban  :');
    console.log(res.answer);
  } catch (err) {
    console.log('❌ Gagal:', err.message);
    process.exit(1);
  }
  process.exit(0);
})();
