/**
 * Diagnosa routing pertanyaan: apakah sebuah pertanyaan akan mengarah ke WEB
 * search, dan sumber apa yang didapat? (tanpa memakai kuota LLM)
 *
 * Jalankan: node src/scripts/diagQuestionRouting.js
 *           node src/scripts/diagQuestionRouting.js "pertanyaan saya"
 */

require('dotenv').config();
const { heuristicPlan } = require('../services/ai/agent/planner');
const { webSearch } = require('../services/ai/agent/webSearch.service');

const DEFAULT_QUESTIONS = [
  'Link layanan BPOM di Palangka Raya apa saja?',
  'Apa jadwal layanan pengaduan konsumen di BBPOM Palangka Raya?',
  'Tautan siaran pers BPOM terbaru?',
  'Kontak dan standar layanan PPID BBPOM Palangka Raya?',
  'Berita terbaru BPOM tentang kosmetik ilegal?',
  'Alamat dan tautan kalender kegiatan BBPOM Palangka Raya?',
  'Regulasi terbaru apa saja yang ada di JDIH POM?',
  'Link daftar informasi publik BBPOM Palangka Raya?',
  'Cek produk kosmetika yang terdaftar (izin edar)?',
  'Rangkum https://jdih.pom.go.id/rule',
  'Apa persyaratan izin edar obat tradisional?',
  'Berapa biaya PNBP registrasi obat?'
];

const questions = process.argv.length > 2 ? [process.argv.slice(2).join(' ')] : DEFAULT_QUESTIONS;

(async () => {
  for (const question of questions) {
    const plan = heuristicPlan(question);
    console.log(`\n=== ${question}`);
    console.log(`  plan (heuristik) : useRag=${plan.useRag} useWeb=${plan.useWeb} | ${plan.reason}`);
    console.log(`  query            : ${plan.queries.join(' | ')}`);

    if (!plan.useWeb) {
      console.log('  → TIDAK memakai web (jawab dari dokumen internal)');
      continue;
    }

    try {
      const res = await webSearch({ queries: plan.queries, limit: 4 });
      console.log(`  penyedia         : ${res.provider}`);
      res.results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.domain} | ${String(r.title).replace(/\s+/g, ' ').slice(0, 62)} (konten ${(r.content || '').length} char)`);
      });
      if (res.results.length === 0) console.log('   (tidak ada hasil)');
      if (res.notes.length) console.log(`  catatan          : ${res.notes.join(' || ').slice(0, 240)}`);
    } catch (err) {
      console.log(`  WEB GAGAL: ${err.message}`);
    }
  }
})();
