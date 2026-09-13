/**
 * Uji alur end-to-end pipeline AI Agent TANPA database & TANPA internet.
 *
 * Cara kerja:
 *  - `vectorSearchService` (RAG) diganti stub yang mengembalikan chunk tetap.
 *  - LLM dinonaktifkan (LLM_ENABLED=false) → memverifikasi jalur fallback.
 *  - Cabang web dimatikan (WEB_SEARCH_PROVIDER=off) agar tidak ada request keluar.
 *
 * Yang diuji: orkestrasi `runAgent()` & `runAgentStream()` termasuk urutan
 * event SSE (plan → sources → token → citations → done).
 *
 * Jalankan: node src/scripts/testAgentFlow.js
 */

process.env.LLM_ENABLED = 'false';
process.env.AGENT_RERANK_LLM = 'false';
process.env.AGENT_WEB_SEARCH_ENABLED = 'false';
process.env.WEB_SEARCH_PROVIDER = 'off';

const vssPath = require.resolve('../services/vectorSearchService');

// Stub cabang RAG (vector search) — dipasang sebelum modul agent dimuat.
require.cache[vssPath] = {
  id: vssPath,
  filename: vssPath,
  loaded: true,
  exports: {
    searchChunks: async () => [
      {
        id: 101,
        document_id: 7,
        chunk_index: 0,
        content: 'Obat tradisional wajib memiliki nomor izin edar (NIE) sebelum diedarkan di wilayah Indonesia.',
        page_number: 3,
        section: 'Pasal 5',
        document_title: 'Peraturan Izin Edar Obat Tradisional',
        score: 0.8
      },
      {
        id: 102,
        document_id: 7,
        chunk_index: 1,
        content: 'Permohonan NIE diajukan melalui sistem e-registration BPOM dengan melampirkan dokumen teknis.',
        page_number: 5,
        section: 'Pasal 8',
        document_title: 'Peraturan Izin Edar Obat Tradisional',
        score: 0.62
      }
    ]
  }
};

const { runAgent, runAgentStream } = require('../services/ai/agent');

let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

(async () => {
  const question = 'Apa syarat izin edar obat tradisional?';

  console.log('\n1) runAgent() — non-streaming, LLM dimatikan (fallback)');
  const result = await runAgent({ question });
  check('jawaban fallback memuat isi chunk terbaik', result.answer.includes('nomor izin edar'), result.answer.slice(0, 80));
  check('sumber RAG dikembalikan', result.sources.length === 2, `sources=${result.sources.length}`);
  check('sumber bernomor sitasi (ref 1..N)', result.sources.every((s, i) => s.ref === i + 1));
  check('sumber bertanda origin=rag', result.sources.every((s) => s.origin === 'rag'));
  check('daftar sumber ditambahkan saat LLM tidak menyitasi', /\*\*Sumber:\*\*/.test(result.answer));
  check('modelUsed = disabled', result.modelUsed === 'disabled', result.modelUsed);
  check('route memuat keputusan planner', !!result.agent?.route && result.agent.route.ragChunks === 2, JSON.stringify(result.agent?.route));
  check('trace memuat tahap plan→rag→select→rerank→generate',
    ['plan', 'rag', 'select', 'rerank', 'generate'].every((s) => result.agent.trace.some((t) => t.stage === s)),
    result.agent.trace.map((t) => t.stage).join(','));

  console.log('\n2) runAgentStream() — urutan event SSE');
  const events = [];
  for await (const evt of runAgentStream({ question })) events.push(evt);
  const types = events.map((e) => e.type);
  check('event pertama = plan', types[0] === 'plan', types.join(','));
  check('sumber dikirim sebelum token', types.indexOf('sources') < types.indexOf('token'));
  check('event citations terkirim', types.includes('citations'));
  check('event terakhir = done', types[types.length - 1] === 'done');

  const streamed = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
  const done = events.find((e) => e.type === 'done');
  check('teks token = sumber jawaban tersimpan', streamed.includes('nomor izin edar'), streamed.slice(0, 60));
  check('done memuat model & sitasi', !!done && done.model === 'disabled' && Array.isArray(done.citations));

  console.log(`\n${failed === 0 ? 'SEMUA UJI ALUR LULUS' : `${failed} UJI ALUR GAGAL`}\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Uji alur gagal dijalankan:', err);
  process.exit(1);
});
