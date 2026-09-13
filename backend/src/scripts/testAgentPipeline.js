/**
 * Uji cepat pipeline AI Agent LAURA (tanpa DB & tanpa internet).
 *
 * Menguji tahap-tahap yang murni lokal:
 *   PLANNER (heuristik) → SOURCE SELECTION → RERANKER (non-LLM) → CITATION
 *
 * Jalankan: node src/scripts/testAgentPipeline.js
 */

// Nonaktifkan pemakaian LLM pada reranker & cabang web agar uji deterministik.
process.env.AGENT_RERANK_LLM = 'false';
process.env.WEB_SEARCH_PROVIDER = 'off';

const { heuristicPlan, looksLikeRegistrationNumber } = require('../services/ai/agent/planner');
const { selectSources, toPublicSources } = require('../services/ai/agent/sourceSelector');
const { rerank } = require('../services/ai/agent/reranker');
const { finalizeCitations, buildSourceBlock } = require('../services/ai/agent/citations');
const { buildAgentSystemPrompt } = require('../services/ai/agent/prompts');
const { webSearch, buildScopedQueries } = require('../services/ai/agent/webSearch.service');
const { isOfficialUrl, getSearchDomains } = require('../services/ai/agent/officialSources');
const webCfg = require('../services/webSearchConfigService');

let failed = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

(async () => {
  console.log('\n1) PLANNER (heuristik)');
  const pWeb = heuristicPlan('Jam layanan BPOM Palangka Raya terbaru?');
  check('pertanyaan terkini → pakai WEB', pWeb.useWeb === true, JSON.stringify(pWeb));
  const pRag = heuristicPlan('Pasal 5 persyaratan izin edar obat tradisional');
  check('pertanyaan regulasi → pakai RAG', pRag.useRag === true);
  const pUrl = heuristicPlan('Rangkum https://www.pom.go.id/ tentang izin edar');
  check('ada URL → query memakai URL', pUrl.queries.some((q) => q.startsWith('http')));

  const pNie = heuristicPlan('cek obat dengan no rek GKL1713713144A1 ini dong');
  check('nomor registrasi → WAJIB pakai WEB', pNie.useWeb === true && pNie.regNumber === true, JSON.stringify(pNie));
  const pCek = heuristicPlan('tolong cek produk ini apakah terdaftar');
  check('cek produk → productCheck + WEB', pCek.productCheck === true && pCek.useWeb === true);
  const pPasal = heuristicPlan('Pasal 1234567 tentang ketentuan label');
  check('"Pasal 1234567" bukan nomor registrasi', pPasal.regNumber === false, JSON.stringify(pPasal.regNumber));
  const pInfo = heuristicPlan('Apa persyaratan izin edar obat tradisional?');
  check('pertanyaan informasi izin edar tetap RAG (bukan cek produk)', pInfo.productCheck === false, JSON.stringify(pInfo.productCheck));

  console.log('\n2) SOURCE SELECTION');
  const ragChunks = [
    { id: 11, document_id: 1, chunk_index: 0, content: 'Izin edar obat tradisional wajib memiliki NIE sebelum diedarkan.', page_number: 3, section: 'Pasal 5', document_title: 'Peraturan Izin Edar', score: 0.82 },
    { id: 12, document_id: 1, chunk_index: 1, content: 'Pengajuan NIE dilakukan melalui sistem e-registration.', page_number: 4, section: 'Pasal 6', document_title: 'Peraturan Izin Edar', score: 0.71 },
    { id: 13, document_id: 1, chunk_index: 2, content: 'Kewajiban label dan kemasan produk.', page_number: 7, section: 'Pasal 9', document_title: 'Peraturan Izin Edar', score: 0.55 },
    { id: 14, document_id: 2, chunk_index: 0, content: 'Tata cara pengaduan produk tidak memenuhi syarat.', page_number: 1, section: null, document_title: 'SOP Pengaduan', score: 0.4 }
  ];
  const webResults = [
    { title: 'Cek Izin Edar', url: 'https://cekbpom.pom.go.id/cek-produk', snippet: 'Cek NIE produk', content: 'Cek NIE', score: 0.6, domain: 'cekbpom.pom.go.id', origin: 'web' },
    { title: 'Blog tidak resmi', url: 'https://blog-contoh.com/izin-edar', snippet: 'izin edar', content: 'izin edar', score: 0.9, domain: 'blog-contoh.com', origin: 'web' }
  ];
  const sel = selectSources({ ragChunks, webResults });
  check('hasil web non-resmi dibuang', sel.candidates.every((c) => c.origin !== 'web' || isOfficialUrl(c.url)), JSON.stringify(sel.dropped));
  check('maksimal 2 chunk per dokumen', sel.candidates.filter((c) => c.documentId === 1).length <= 2);
  check('kandidat terurut menurun', sel.candidates.every((c, i, a) => i === 0 || a[i - 1].score >= c.score));

  console.log('\n3) RERANKER (tanpa LLM)');
  const { candidates: ranked, usedSignals } = await rerank({
    question: 'persyaratan NIE izin edar obat tradisional',
    candidates: sel.candidates,
    topN: 3
  });
  check('rerank memberi skor final 0..1', ranked.every((c) => c.rerank_score >= 0 && c.rerank_score <= 1));
  check('sinyal terpakai = vector+lexical', usedSignals.includes('vector') && usedSignals.includes('lexical'), usedSignals.join(','));
  check('chunk paling relevan ada di peringkat atas', /NIE|izin edar/i.test(ranked[0].content), ranked[0]?.content?.slice(0, 60));

  console.log('\n4) SOURCES untuk API');
  const sources = toPublicSources(ranked, 3);
  check('penomoran sitasi 1..N', sources.every((s, i) => s.ref === i + 1));
  check('field lama tetap ada (title/page/section/score)', sources.every((s) => 'title' in s && 'page' in s && 'section' in s && 'score' in s));
  check('field baru ada (origin/url/ref)', sources.every((s) => 'origin' in s && 'url' in s && 'ref' in s));

  console.log('\n5) CITATION');
  const cited = finalizeCitations({ answer: 'Izin edar wajib dimiliki [1][2]. Nomor palsu [9] diabaikan.', sources });
  check('penanda di luar rentang dihapus', !cited.answer.includes('[9]'));
  check('ref yang dipakai terdeteksi', cited.usedRefs.join(',') === '1,2', cited.usedRefs.join(','));
  check('daftar citations memuat flag used', cited.citations.filter((c) => c.used).length === 2);
  const noCite = finalizeCitations({ answer: 'Jawaban tanpa sitasi.', sources });
  check('daftar Sumber: ditambahkan bila LLM lupa sitasi', /Sumber:/.test(noCite.answer));

  console.log('\n6) PROMPT');
  const sys = buildAgentSystemPrompt({ sources, accessDate: '13 September 2026', webUsed: true });
  check('prompt memuat blok sumber bernomor', sys.includes('[1]') && sys.includes('Aturan sitasi'));
  check('buildSourceBlock menandai kanal sumber', buildSourceBlock(sources).includes('DOKUMEN INTERNAL'));

  console.log('\n7) WEB SEARCH (dimatikan)');
  const web = await webSearch({ queries: ['jadwal layanan bpom'] });
  check('provider off → hasil kosong + catatan', web.results.length === 0 && web.notes.length > 0, JSON.stringify(web.notes));

  console.log('\n8) LINGKUP domain web search (scope)');
  check('pom.go.id termasuk lingkup', isOfficialUrl('https://www.pom.go.id/regulasi') === true);
  check('cekbpom.pom.go.id termasuk lingkup', isOfficialUrl('https://cekbpom.pom.go.id/cek-produk') === true);
  check('bpk.go.id TIDAK termasuk lingkup (default)', isOfficialUrl('https://peraturan.bpk.go.id/x') === false);
  check('kemenkes.go.id TIDAK termasuk lingkup (default)', isOfficialUrl('https://kemkes.go.id/x') === false);
  check('domain akar untuk site: = seluruh domain lingkup',
    getSearchDomains().join(',') === 'pom.go.id,bpom.go.id,bbpom.go.id,bbpompky.id', getSearchDomains().join(','));
  check('query dibatasi ke domain lingkup',
    buildScopedQueries(['izin edar obat'], true).every((q) => /site:(pom\.go\.id|bbpompky\.id)/.test(q)),
    buildScopedQueries(['izin edar obat'], true).join(' | '));
  process.env.WEB_SEARCH_ALLOW_GOID_SUFFIX = 'true';
  check('opt-in WEB_SEARCH_ALLOW_GOID_SUFFIX=true → *.go.id ikut',
    isOfficialUrl('https://peraturan.bpk.go.id/x') === true);
  delete process.env.WEB_SEARCH_ALLOW_GOID_SUFFIX;
  check('opt-in dimatikan lagi → tertutup', isOfficialUrl('https://peraturan.bpk.go.id/x') === false);
  process.env.WEB_SEARCH_ALLOWED_DOMAINS = 'bpk.go.id';
  check('WEB_SEARCH_ALLOWED_DOMAINS menambah lingkup', isOfficialUrl('https://peraturan.bpk.go.id/x') === true);
  delete process.env.WEB_SEARCH_ALLOWED_DOMAINS;

  console.log('\n9) NORMALISASI input dashboard (link terpercaya)');
  check('URL domain -> domain saja', webCfg.normalizeDomain('https://WWW.POM.go.id/regulasi?x=1') === 'pom.go.id');
  check('domain dengan port dibuang', webCfg.normalizeDomain('pom.go.id:443') === 'pom.go.id');
  check('spasi/huruf besar dirapikan', webCfg.normalizeDomain('  CekBPOM.POM.GO.ID  ') === 'cekbpom.pom.go.id');
  check('domain tidak valid ditolak', webCfg.normalizeDomain('bukan domain!') === null);
  check('http/https valid diterima', webCfg.normalizeUrl('https://www.pom.go.id/') === 'https://www.pom.go.id/');
  check('skema lain ditolak', webCfg.normalizeUrl('ftp://pom.go.id') === null);

  console.log(`\n${failed === 0 ? 'SEMUA UJI LULUS' : `${failed} UJI GAGAL`}\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Uji gagal dijalankan:', err);
  process.exit(1);
});
