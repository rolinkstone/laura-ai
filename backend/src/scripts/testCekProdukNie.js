/**
 * Uji skenario nyata: pertanyaan "cek produk dengan nomor registrasi".
 *
 * Memverifikasi perbaikan:
 *  - planner WAJIB mengaktifkan cabang web untuk pertanyaan nomor registrasi
 *  - sumber RAG yang lemah (relevansi rendah) memicu eskalasi ke web search
 *  - jawaban tetap jujur bila datanya memang tidak ditemukan
 *
 * Jalankan: node src/scripts/testCekProdukNie.js "cek obat dengan no rek GKL1713713144A1 ini dong"
 */

require('dotenv').config();
const { ask } = require('../services/ai/ai.service');

const question = process.argv.slice(2).join(' ') || 'cek obat dengan no rek GKL1713713144A1 ini dong';

(async () => {
  const startedAt = Date.now();
  try {
    const result = await ask({ question });

    console.log(`\nPertanyaan: ${question}`);
    console.log(`Durasi    : ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    console.log(`Model     : ${result.modelUsed} (${result.provider || '-'})`);

    const route = result.agent?.route || {};
    console.log('\nRoute:');
    console.log(`  useRag=${route.useRag} useWeb=${route.useWeb} provider=${route.webProvider || '-'}`);
    console.log(`  ragChunks=${route.ragChunks} webResults=${route.webResults} sourcesUsed=${route.sourcesUsed}`);
    console.log(`  eskalasi=${route.escalationReason || '-'} | sumberLemah=${route.weakSources} | bestScore=${route.bestScore}`);
    if (route.webScope?.queries?.length) {
      console.log(`  query web: ${route.webScope.queries[0]}`);
    }
    if (route.webNotes?.length) {
      console.log(`  catatan web: ${JSON.stringify(route.webNotes)}`);
    }

    console.log('\nSumber yang dipakai:');
    if (!result.sources || result.sources.length === 0) console.log('  (tidak ada)');
    (result.sources || []).forEach((s) => {
      console.log(`  [${s.ref}] ${s.origin.padEnd(3)} | skor ${s.score} | ${String(s.title).slice(0, 45)} | ${s.url || '-'}`);
    });

    console.log(`\nJAWABAN:\n${(result.answer || '').slice(0, 1200)}`);
  } catch (err) {
    console.log('GAGAL:', err.message);
  }
})();
