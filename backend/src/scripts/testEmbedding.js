/**
 * Uji embedding model lokal (transformers.js).
 * Mengunduh model dari HuggingFace pada run pertama.
 * Jalankan: node src/scripts/testEmbedding.js
 */
require('dotenv').config();

const run = async () => {
  try {
    const { pipeline } = require('@xenova/transformers');
    console.log('⏳ Memuat model embedding... (unduh model pada run pertama)');

    // Model multilingual 384-dimensi, bagus untuk Bahasa Indonesia
    const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');

    const texts = [
      'Pemohon dapat menyampaikan pengaduan melalui kanal pengaduan resmi BPOM.',
      'Bagaimana cara melakukan pengaduan?'
    ];

    for (const t of texts) {
      const out = await extractor(`passage: ${t}`, { pooling: 'mean', normalize: true });
      const vec = Array.from(out.data);
      console.log(`\nTeks: ${t}`);
      console.log(`Dimensi: ${vec.length}`);
      console.log(`Vector (10 nilai pertama): [${vec.slice(0, 10).map((v) => v.toFixed(4)).join(', ')}...]`);
    }

    console.log('\n✅ Embedding lokal berhasil!');
  } catch (err) {
    console.error('❌ Gagal:', err.message);
    process.exitCode = 1;
  }
};

run();
