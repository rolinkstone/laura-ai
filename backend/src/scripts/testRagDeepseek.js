/**
 * Uji pipeline RAG dengan DeepSeek sebagai provider utama.
 * Jalankan: node src/scripts/testRagDeepseek.js
 */
require('dotenv').config();
process.env.AI_PROVIDER = 'deepseek'; // paksa DeepSeek utama

const { ask, getProviderOrder, isProviderConfigured } = require('../services/ai/ai.service');

(async () => {
  const order = getProviderOrder();
  console.log('Urutan provider:', order.map((p) => p.name).join(' -> '));

  const r = await ask({ question: 'Bagaimana cara melakukan pengaduan di BPOM?' });
  console.log('\n✅ Provider yang menjawab:', r.provider, '| model:', r.modelUsed);
  console.log('   Sources:', r.sources.length);
  console.log('\n--- JAWABAN (300 char pertama) ---');
  console.log(r.answer.slice(0, 300));
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
