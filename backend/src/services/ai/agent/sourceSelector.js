/**
 * SOURCE SELECTION — tahap "pilih & rapikan kandidat sumber" pada diagram.
 *
 * Input : kandidat dari DUA cabang — RAG (chunk dokumen) dan WEB SEARCH
 *         (halaman situs resmi).
 * Proses:
 *   1. Normalisasi ke bentuk kandidat yang seragam.
 *   2. Kebijakan sumber: hasil web wajib dari domain resmi (bila diaktifkan).
 *   3. Deduplikasi: URL sama, chunk sama, atau isi yang identik.
 *   4. Buang kandidat ber-skori jauh di bawah kandidat terbaik (per kanal).
 *   5. Batasi keragaman: maksimal N chunk per dokumen & N hasil per domain.
 * Output: kandidat siap diranking (reranker) + alasan pembuangan (audit).
 */

const { config } = require('./config');
const { isOfficialUrl, domainOf } = require('./officialSources');

/**
 * Ubah chunk hasil vector search menjadi kandidat sumber.
 * @param {Array} chunks hasil `searchChunks()`
 * @returns {Array}
 */
const fromRagChunks = (chunks = []) =>
  chunks.map((c) => ({
    id: `rag:${c.id}`,
    origin: 'rag',
    title: c.document_title || 'Dokumen',
    url: null,
    domain: null,
    page: c.page_number ?? null,
    section: c.section || null,
    documentId: c.document_id ?? null,
    chunkIndex: c.chunk_index ?? null,
    content: String(c.content || ''),
    snippet: String(c.content || '').slice(0, 300),
    score: Number(c.score) || 0,
    fetched: true
  }));

/**
 * Ubah hasil web search menjadi kandidat sumber.
 * @param {Array} results hasil `webSearch()`
 * @returns {Array}
 */
const fromWebResults = (results = []) =>
  results.map((r, i) => ({
    id: `web:${i + 1}`,
    origin: 'web',
    title: r.title || r.url,
    url: r.url,
    domain: r.domain || domainOf(r.url),
    page: null,
    section: r.domain || null,
    documentId: null,
    chunkIndex: null,
    content: String(r.content || r.snippet || ''),
    snippet: String(r.snippet || '').slice(0, 300),
    score: Number.isFinite(Number(r.score)) ? Number(r.score) : 0.5,
    fetched: !!r.fetched
  }));

/**
 * Kunci isi (untuk mendeteksi konten duplikat antar kanal).
 * @param {string} content
 * @returns {string}
 */
const contentKey = (content) =>
  String(content || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]/gi, '')
    .slice(0, 200);

/**
 * Buang kandidat dengan skor < rasio tertentu terhadap kandidat terbaik
 * (dihitung PER kanal agar skor RAG dan WEB yang berbeda skala tidak saling
 * menjatuhkan).
 * @param {Array} candidates
 * @param {number} ratio
 * @returns {Array}
 */
const applyRelativeFloor = (candidates, ratio) => {
  const kept = [];
  for (const origin of ['rag', 'web']) {
    const group = candidates.filter((c) => c.origin === origin);
    if (group.length === 0) continue;
    const best = Math.max(...group.map((c) => c.score));
    const floor = best * ratio;
    const survivors = group.filter((c) => c.score >= floor);
    kept.push(...(survivors.length ? survivors : [group[0]]));
  }
  return kept;
};

/**
 * Batasi jumlah kandidat per dokumen (RAG) dan per domain (web).
 * @param {Array} candidates sudah terurut menurun
 * @param {{maxPerDocument: number, maxPerDomain: number}} limits
 * @returns {Array}
 */
const applyDiversity = (candidates, { maxPerDocument, maxPerDomain }) => {
  const perDoc = new Map();
  const perDomain = new Map();
  const out = [];

  for (const c of candidates) {
    if (c.origin === 'rag' && c.documentId !== null) {
      const n = perDoc.get(c.documentId) || 0;
      if (n >= maxPerDocument) continue;
      perDoc.set(c.documentId, n + 1);
    }
    if (c.origin === 'web' && c.domain) {
      const n = perDomain.get(c.domain) || 0;
      if (n >= maxPerDomain) continue;
      perDomain.set(c.domain, n + 1);
    }
    out.push(c);
  }
  return out;
};

/**
 * SOURCE SELECTION.
 *
 * @param {{ragChunks?: Array, webResults?: Array, options?: object}} param
 * @returns {{candidates: Array, dropped: object}}
 */
const selectSources = ({ ragChunks = [], webResults = [], options = {} }) => {
  const cfg = config();
  // `officialOnly` tinggal di cfg.web (satu sumber kebenaran), sisanya cfg.selection.
  const opts = { officialOnly: cfg.web.officialOnly, ...cfg.selection, ...options };

  const rag = fromRagChunks(ragChunks);
  const web = fromWebResults(webResults);

  const dropped = { policy: 0, duplicate: 0, lowScore: 0, diversity: 0, overLimit: 0 };

  // 1. Kebijakan: hasil web wajib berasal dari situs resmi.
  const webAllowed = opts.officialOnly ? web.filter((c) => isOfficialUrl(c.url)) : web;
  dropped.policy = web.length - webAllowed.length;

  // 2. Deduplikasi (URL, chunk, isi).
  const seen = new Set();
  const merged = [];
  for (const c of [...rag, ...webAllowed]) {
    const keys = [
      c.url ? `u:${c.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase()}` : null,
      c.origin === 'rag' ? `c:${c.documentId}:${c.chunkIndex}` : null,
      c.content ? `t:${contentKey(c.content)}` : null
    ].filter(Boolean);

    if (keys.some((k) => seen.has(k))) {
      dropped.duplicate += 1;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    merged.push(c);
  }

  // 3. Buang kandidat ber-skori sangat rendah.
  let filtered = applyRelativeFloor(merged, opts.minRelativeScore);
  dropped.lowScore = merged.length - filtered.length;
  if (filtered.length === 0 && merged.length > 0) filtered = [...merged].sort((a, b) => b.score - a.score).slice(0, 1);

  // 4. Keragaman (dokumen/domain) + batas kandidat ke reranker.
  const sorted = [...filtered].sort((a, b) => b.score - a.score);
  const diversified = applyDiversity(sorted, opts);
  dropped.diversity = sorted.length - diversified.length;

  const candidates = diversified.slice(0, Math.max(1, opts.preRerankLimit));
  dropped.overLimit = diversified.length - candidates.length;

  return { candidates, dropped };
};

/**
 * Sumber siap pakai untuk respons API (backward compatible dengan field lama
 * `title`/`page`/`section`/`score` + field baru `ref`/`origin`/`url`).
 *
 * @param {Array} candidates sudah terurut & terbatas (setelah rerank)
 * @param {number} [max]
 * @returns {Array}
 */
const toPublicSources = (candidates, max = null) => {
  const list = max ? candidates.slice(0, max) : candidates;
  return list.map((c, i) => ({
    // Nomor sitasi yang dipakai LLM: [1], [2], ...
    ref: i + 1,
    id: c.id,
    origin: c.origin,
    type: c.origin === 'web' ? 'website' : 'document',
    title: c.title,
    url: c.url || null,
    domain: c.domain || null,
    page: c.page ?? null,
    section: c.section || null,
    // Skor final (setelah rerank) — dipakai badge persentase di frontend
    score: Number((c.rerank_score ?? c.score ?? 0).toFixed(4)),
    rerank_score: c.rerank_score ?? null,
    signals: c.signals || null
  }));
};

module.exports = {
  selectSources,
  toPublicSources,
  fromRagChunks,
  fromWebResults,
  applyRelativeFloor,
  applyDiversity
};
