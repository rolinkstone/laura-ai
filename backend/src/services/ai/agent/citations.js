/**
 * CITATION — daun terakhir diagram: mengubah daftar sumber menjadi sitasi
 * bernomor `[1]`, `[2]`, ... di dalam jawaban, sekaligus menyiapkan daftar
 * "Sumber" yang bisa ditampilkan/diklik di antarmuka.
 *
 * Kontrak dengan LLM:
 *  - Sumber dinomori 1..N sesuai urutan pada blok SUMBER di system prompt.
 *  - LLM menulis penanda [n] tepat setelah pernyataan yang didukung sumber n.
 *  - Modul ini memvalidasi penanda (menghapus nomor di luar rentang) dan
 *    melaporkan sumber mana saja yang benar-benar dipakai.
 */

const { config } = require('./config');

const CITATION_RULES = `Aturan sitasi:
1. Setiap fakta/ketentuan yang diambil dari sumber WAJIB diikuti penanda sitasi bernomor, contoh: "Izin edar wajib dimiliki sebelum produk diedarkan [1]."
2. Nomor sitasi hanya boleh 1 sampai jumlah sumber yang tersedia. JANGAN membuat nomor di luar rentang itu.
3. Beberapa sumber boleh disitasi bersamaan: [1][3].
4. Bila informasi tidak ada di sumber mana pun, katakan belum tersedia — JANGAN menebak dan JANGAN memberi sitasi palsu.
5. Bila sumber berupa WEBSITE, tuliskan juga nama situsnya secara singkat (mis. "menurut laman resmi BPOM [2]").`;

/**
 * Blok sumber bernomor untuk system prompt.
 * @param {Array} sources kandidat terpilih (sudah terurut)
 * @param {string} [accessDate] tanggal akses (untuk sumber web)
 * @returns {string}
 */
const buildSourceBlock = (sources = [], accessDate = null) => {
  if (!sources || sources.length === 0) return '(tidak ada sumber relevan yang ditemukan)';

  return sources
    .map((s, i) => {
      const lines = [`[${i + 1}] ${s.origin === 'web' ? 'WEBSITE RESMI' : 'DOKUMEN INTERNAL'}`];
      lines.push(`Judul   : ${s.title}`);
      if (s.url) lines.push(`URL     : ${s.url}${accessDate ? ` (diakses ${accessDate})` : ''}`);
      if (s.page) lines.push(`Halaman : ${s.page}`);
      if (s.section && s.origin !== 'web') lines.push(`Section : ${s.section}`);
      lines.push('---');
      lines.push(String(s.content || s.snippet || '').trim());
      return lines.join('\n');
    })
    .join('\n\n');
};

/**
 * Nomor sitasi yang benar-benar dipakai LLM.
 * @param {string} answer
 * @param {number} max
 * @returns {number[]}
 */
const extractUsedRefs = (answer, max) => {
  const refs = new Set();
  for (const m of String(answer || '').matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= max) refs.add(n);
  }
  return [...refs].sort((a, b) => a - b);
};

/**
 * Hapus penanda sitasi di luar rentang (menghindari halusinasi nomor).
 * @param {string} answer
 * @param {number} max
 * @returns {string}
 */
const stripInvalidRefs = (answer, max) =>
  String(answer || '').replace(/\[(\d{1,2})\]/g, (full, n) => {
    const num = Number(n);
    return num >= 1 && num <= max ? full : '';
  });

/**
 * Daftar sitasi terstruktur (untuk UI/penyimpanan).
 * @param {Array} sources
 * @param {number[]} usedRefs
 * @returns {Array}
 */
const buildCitations = (sources = [], usedRefs = []) =>
  sources.map((s, i) => ({
    ref: i + 1,
    id: s.id,
    origin: s.origin,
    type: s.origin === 'web' ? 'website' : 'document',
    title: s.title,
    url: s.url || null,
    domain: s.domain || null,
    page: s.page ?? null,
    section: s.section || null,
    score: Number((s.rerank_score ?? s.score ?? 0).toFixed(4)),
    used: usedRefs.includes(i + 1)
  }));

/**
 * Tambahkan daftar "Sumber:" di akhir jawaban bila LLM tidak menulis sitasi.
 * @param {string} answer
 * @param {Array} citations
 * @returns {string}
 */
const appendSourceList = (answer, citations = []) => {
  const items = citations
    .filter((c) => c.used)
    .map((c) => {
      const where =
        c.origin === 'web'
          ? ` — ${c.domain || c.url}`
          : c.page
            ? ` — hal. ${c.page}${c.section ? ` (${c.section})` : ''}`
            : '';
      return `- [${c.ref}] ${c.title}${where}`;
    });

  const list = items.length ? items : citations.slice(0, 3).map((c) => `- [${c.ref}] ${c.title}`);

  return `${String(answer || '').trim()}\n\n**Sumber:**\n${list.join('\n')}`;
};

/**
 * Finalisasi jawaban + sitasi.
 *
 * @param {{answer: string, sources: Array, rewriteRefs?: boolean, weakSources?: boolean}} param
 *        `rewriteRefs=false` dipakai pada mode streaming: isi jawaban sudah
 *        terkirim ke pengguna sehingga tidak boleh diubah lagi.
 *        `weakSources=true` → daftar "Sumber:" TIDAK ditambahkan karena sumber
 *        tersebut dinilai tidak relevan (menyesatkan bila ditampilkan).
 * @returns {{answer: string, citations: Array, usedRefs: number[], usedSources: number}}
 */
const finalizeCitations = ({ answer, sources = [], rewriteRefs = true, weakSources = false }) => {
  const cfg = config();
  const max = Math.min(sources.length, cfg.citation.maxSources || sources.length);

  if (!cfg.citation.enabled || sources.length === 0) {
    return { answer: String(answer || ''), citations: [], usedRefs: [], usedSources: 0 };
  }

  // Sumber di luar batas maksimal sitasi tidak boleh disitasi.
  let cleaned = rewriteRefs ? stripInvalidRefs(answer, max) : String(answer || '');
  const usedRefs = extractUsedRefs(cleaned, max);
  let citations = buildCitations(sources, usedRefs);

  if (usedRefs.length === 0 && cfg.citation.appendList && !weakSources) {
    cleaned = appendSourceList(cleaned, citations);
  }

  citations = buildCitations(sources, usedRefs.length ? usedRefs : citations.slice(0, 3).map((c) => c.ref));

  return { answer: cleaned.trim(), citations, usedRefs, usedSources: usedRefs.length };
};

module.exports = {
  CITATION_RULES,
  buildSourceBlock,
  extractUsedRefs,
  stripInvalidRefs,
  buildCitations,
  appendSourceList,
  finalizeCitations
};
