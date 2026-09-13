/**
 * Uji cepat cabang WEB SEARCH saja (tanpa LLM) — untuk melihat sumber apa yang
 * didapat LAURA untuk sebuah pertanyaan.
 *
 * Jalankan: node src/scripts/testWebSearch.js "jam layanan BBPOM Palangka Raya"
 */

require('dotenv').config();
const { webSearch } = require('../services/ai/agent/webSearch.service');

const query = process.argv.slice(2).join(' ') || 'jam layanan BBPOM Palangka Raya';

(async () => {
  const startedAt = Date.now();
  try {
    const res = await webSearch({ queries: [query], limit: 5 });

    console.log(`\nPertanyaan : ${query}`);
    console.log(`Penyedia   : ${res.provider}`);
    console.log(`Durasi     : ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    console.log(`Lingkup    : ${(res.scope?.domains || []).join(', ')}`);
    console.log(`Query      : ${res.scope?.queries?.[0] || '-'}`);
    if (res.notes?.length) console.log(`Catatan    : ${JSON.stringify(res.notes)}`);

    console.log('\nHasil:');
    if (res.results.length === 0) console.log('  (tidak ada)');
    res.results.forEach((r) => {
      const snippet = String(r.content || r.snippet || '').replace(/\s+/g, ' ').slice(0, 110);
      console.log(`  - ${r.domain} | ${String(r.title).slice(0, 60)}`);
      console.log(`    ${r.url}`);
      console.log(`    konten ${(r.content || '').length} char${r.fetched ? ' (diunduh)' : ' (hanya cuplikan)'} :: ${snippet}`);
    });
  } catch (err) {
    console.log('GAGAL:', err.message);
  }
})();
