/**
 * RERANKER — mengambil kandidat hasil Source Selection dan mengurutkannya ulang
 * berdasarkan relevansi sebenarnya terhadap pertanyaan pengguna.
 *
 * Tiga sinyal yang digabung (bobot dapat diatur lewat .env):
 *   1. vector  — skor kemiripan embedding dari vector search (RAG).
 *   2. lexical — kedekatan kata kunci pertanyaan vs isi sumber (BM25-lite).
 *   3. llm     — penilaian relevansi oleh LLM (cross-encoder style, 0-10).
 *
 * Jika LLM nonaktif/gagal → bobot dinormalisasi ulang ke sinyal yang tersedia,
 * sehingga pipeline tetap deterministik dan TIDAK pernah gagal karena reranker.
 */

const { completeJson } = require('../llmRuntime');
const { config } = require('./config');

const STOPWORDS = new Set([
  'yang', 'untuk', 'dengan', 'pada', 'dari', 'dalam', 'adalah', 'atau', 'dan', 'ini', 'itu',
  'apa', 'apakah', 'bagaimana', 'dimana', 'kapan', 'siapa', 'mengapa', 'kenapa', 'berapa',
  'saya', 'anda', 'kami', 'kita', 'bisa', 'dapat', 'tidak', 'akan', 'juga', 'agar', 'oleh',
  'tentang', 'mengenai', 'cara', 'the', 'and', 'for', 'with', 'that', 'this'
]);

/**
 * Tokenisasi sederhana (kata bermakna, minimal 3 huruf).
 * @param {string} text
 * @returns {string[]}
 */
const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

const minMaxNormalize = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-9) {
    return values.map(() => (max > 0 ? 1 : 0));
  }
  return values.map((v) => (v - min) / (max - min));
};

/**
 * Skor leksikal BM25-lite: tf tersaturasi × idf, dinormalisasi 0..1.
 * @param {string} question
 * @param {Array} candidates
 * @returns {number[]}
 */
const lexicalScores = (question, candidates) => {
  const qTokens = [...new Set(tokenize(question))];
  if (qTokens.length === 0) return candidates.map(() => 0);

  const docTokens = candidates.map((c) => tokenize(`${c.title} ${c.section || ''} ${c.content}`));
  const N = candidates.length || 1;

  const idf = new Map();
  for (const term of qTokens) {
    const df = docTokens.filter((tokens) => tokens.includes(term)).length;
    idf.set(term, Math.log(1 + N / (1 + df)) + 1);
  }

  const raw = docTokens.map((tokens) => {
    let score = 0;
    for (const term of qTokens) {
      const tf = tokens.filter((t) => t === term).length;
      if (tf > 0) score += Math.log(1 + tf) * (idf.get(term) || 1);
    }
    return score;
  });

  const max = Math.max(...raw, 0);
  return max > 0 ? raw.map((s) => s / max) : raw.map(() => 0);
};

const RERANK_SYSTEM = `Anda adalah RERANKER dokumen untuk asisten resmi BBPOM di Palangka Raya.
Tugas: menilai relevansi setiap kandidat sumber terhadap pertanyaan pengguna.

Penilaian:
- 9-10 : berisi jawaban langsung dan lengkap untuk pertanyaan.
- 6-8  : sangat relevan, mendukung sebagian besar jawaban.
- 3-5  : hanya menyinggung topik, tidak menjawab langsung.
- 0-2  : tidak relevan / hanya kebetulan memuat kata yang sama.

Balas HANYA JSON valid: {"scores":[{"i":1,"s":0}, ...]} — satu entri untuk SETIAP kandidat, tanpa teks lain.`;

/**
 * Nilai relevansi kandidat dengan LLM (0-10 → 0..1).
 * @param {{question: string, candidates: Array, timeoutMs: number, maxTokens: number, snippetChars: number}} param
 * @returns {Promise<number[]|null>} null bila gagal (pemanggil memakai sinyal lain)
 */
const llmScores = async ({ question, candidates, timeoutMs, maxTokens, snippetChars }) => {
  const listing = candidates
    .map((c, i) => {
      const meta =
        c.origin === 'web'
          ? `WEB — ${c.title} (${c.domain || c.url})`
          : `DOKUMEN — ${c.title}${c.page ? ` (hal. ${c.page})` : ''}${c.section ? ` — ${c.section}` : ''}`;
      const body = String(c.content || c.snippet || '').replace(/\s+/g, ' ').slice(0, snippetChars);
      return `[${i + 1}] ${meta}\n${body}`;
    })
    .join('\n\n');

  const { data } = await completeJson({
    system: RERANK_SYSTEM,
    user: `Pertanyaan pengguna: ${question}\n\nKandidat sumber:\n${listing}`,
    maxTokens,
    temperature: 0,
    timeoutMs,
    label: 'reranker'
  });

  const rows = Array.isArray(data) ? data : data?.scores;
  if (!Array.isArray(rows)) throw new Error('JSON reranker tidak valid');

  const scores = candidates.map(() => null);
  for (const row of rows) {
    const idx = Number(row?.i ?? row?.index) - 1;
    const val = Number(row?.s ?? row?.score);
    if (Number.isInteger(idx) && idx >= 0 && idx < scores.length && Number.isFinite(val)) {
      scores[idx] = Math.max(0, Math.min(val, 10)) / 10;
    }
  }

  // Bila LLM tidak menilai sebagian kandidat, sinyal LLM dianggap tidak lengkap.
  return scores.every((s) => s === null) ? null : scores.map((s) => (s === null ? 0 : s));
};

/**
 * RERANKER utama.
 *
 * @param {{question: string, candidates: Array, topN?: number|null}} param
 * @returns {Promise<{candidates: Array, usedSignals: string[]}>} candidates terurut menurun
 */
const rerank = async ({ question, candidates = [], topN = null }) => {
  const cfg = config();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { candidates: [], usedSignals: [] };
  }

  if (!cfg.rerank.enabled) {
    return {
      candidates: [...candidates].sort((a, b) => b.score - a.score).map((c) => ({ ...c, rerank_score: c.score })),
      usedSignals: ['vector']
    };
  }

  // 1. Sinyal vector (dinormalisasi lintas kandidat).
  const vector = minMaxNormalize(candidates.map((c) => Number(c.score) || 0));

  // 2. Sinyal leksikal.
  const lexical = lexicalScores(question, candidates);

  // 3. Sinyal LLM (opsional).
  let llm = null;
  if (cfg.rerank.useLlm && candidates.length > 1) {
    try {
      llm = await llmScores({
        question,
        candidates,
        timeoutMs: cfg.rerank.timeoutMs,
        maxTokens: cfg.rerank.maxTokens,
        snippetChars: cfg.rerank.snippetChars
      });
    } catch (err) {
      console.warn(`[agent:reranker] penilaian LLM dilewati: ${err.message}`);
      llm = null;
    }
  }

  // 4. Gabungkan bobot (dinormalisasi ulang ke sinyal yang tersedia).
  const w = cfg.rerank.weights;
  const active = [];
  if (w.vector > 0) active.push({ key: 'vector', weight: w.vector, values: vector });
  if (w.lexical > 0) active.push({ key: 'lexical', weight: w.lexical, values: lexical });
  if (llm && w.llm > 0) active.push({ key: 'llm', weight: w.llm, values: llm });

  if (active.length === 0) {
    return {
      candidates: [...candidates].sort((a, b) => b.score - a.score).map((c) => ({ ...c, rerank_score: c.score })),
      usedSignals: ['vector']
    };
  }

  const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);

  const scored = candidates.map((c, i) => {
    let final = 0;
    const signals = {};
    for (const s of active) {
      signals[s.key] = Number(s.values[i].toFixed(4));
      final += (s.values[i] * s.weight) / totalWeight;
    }
    return { ...c, rerank_score: Number(final.toFixed(4)), signals };
  });

  scored.sort((a, b) => b.rerank_score - a.rerank_score);

  return { candidates: topN ? scored.slice(0, topN) : scored, usedSignals: active.map((s) => s.key) };
};

module.exports = { rerank, lexicalScores, llmScores, tokenize };
