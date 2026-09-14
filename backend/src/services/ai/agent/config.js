/**
 * Konfigurasi pipeline AI Agent (LAURA).
 *
 * Semua nilai dapat diatur lewat environment (.env / docker-compose) TANPA
 * mengubah kode. `config()` adalah fungsi (bukan objek statis) supaya nilai
 * env yang berubah saat runtime tetap terbaca.
 *
 * Alur yang dikonfigurasi (lihat docs/agent-pipeline.md):
 *   PLAN → RAG ∥ WEB SEARCH → SOURCE SELECTION → RERANKER → LLM → CITATION
 */

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return !/^(0|false|no|off|nonaktif)$/i.test(String(value).trim());
};

// Pengaturan lingkup sumber web dari dashboard admin (null = ikut .env)
const webSearchConfig = require('../../webSearchConfigService');

const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Konfigurasi pipeline (dibaca ulang setiap pemanggilan).
 * @returns {object}
 */
const config = () => ({
  // Master switch: false → kembali ke pipeline RAG legacy (tanpa agent)
  enabled: bool(process.env.AGENT_ENABLED, true),

  planner: {
    // AI Agent menentukan: pakai RAG? pakai Web Search? query apa?
    enabled: bool(process.env.AGENT_PLANNER_ENABLED, true),
    timeoutMs: num(process.env.AGENT_PLANNER_TIMEOUT_MS, 20000),
    // 400 token terlalu pendek → jawaban model terpotong & JSON tidak valid
    maxTokens: num(process.env.AGENT_PLANNER_MAX_TOKENS, 800)
  },

  rag: {
    // Jumlah kandidat chunk dari vector search (sebelum selection + rerank)
    candidates: num(process.env.AGENT_RAG_CANDIDATES, 12),
    minScore: num(process.env.SEARCH_MIN_SCORE, 0.15),
    // Dokumen yang di-upload di dashboard SELALU ikut dicari — termasuk saat
    // pertanyaan memuat URL / dirutekan ke web search.
    alwaysUse: bool(process.env.AGENT_ALWAYS_USE_RAG, true)
  },

  web: {
    enabled: bool(process.env.AGENT_WEB_SEARCH_ENABLED, true),
    // auto | tavily | brave | serpapi | duckduckgo | internal | off
    provider: String(process.env.WEB_SEARCH_PROVIDER || 'auto').trim().toLowerCase(),
    results: num(process.env.AGENT_WEB_RESULTS, 6),
    officialOnly:
      webSearchConfig.getOfficialOnly() === null || webSearchConfig.getOfficialOnly() === undefined
        ? bool(process.env.WEB_SEARCH_OFFICIAL_ONLY, true)
        : webSearchConfig.getOfficialOnly(),
    // Berapa hasil teratas yang kontennya diunduh (grounding + sitasi)
    fetchTop: num(process.env.WEB_SEARCH_FETCH_TOP, 3),
    fetchTimeoutMs: num(process.env.WEB_SEARCH_FETCH_TIMEOUT_MS, 15000),
    // Batas panjang konten per hasil web (karakter) agar prompt tidak membengkak
    contentChars: num(process.env.WEB_SEARCH_CONTENT_CHARS, 2500),
    // Naik ke web search bila sumber RAG lemah (skor rendah / dinilai 0 oleh reranker)
    escalateOnWeak: bool(process.env.AGENT_ESCALATE_ON_WEAK, true),
    // Bila penyedia pencarian tidak menghasilkan apa pun (mis. DuckDuckGo memblokir),
    // otomatis crawl halaman indeks resmi yang terdaftar (mode internal).
    fallbackInternal: bool(process.env.WEB_SEARCH_FALLBACK_INTERNAL, true)
  },

  selection: {
    // Jumlah sumber final yang dikirim ke LLM & ditampilkan sebagai sitasi
    topK: num(process.env.AGENT_TOP_K, 5),
    // Skor rerank minimum agar sumber dianggap layak dipakai
    // (< ini → sumber dianggap lemah, agent mencoba cari ke web)
    minTopScore: num(process.env.AGENT_MIN_TOP_SCORE, 0.35),
    // Buang kandidat dengan skor < rasio ini terhadap skor tertinggi
    minRelativeScore: num(process.env.AGENT_MIN_RELATIVE_SCORE, 0.3),
    maxPerDocument: num(process.env.AGENT_MAX_PER_DOCUMENT, 2),
    maxPerDomain: num(process.env.AGENT_MAX_PER_DOMAIN, 2),
    // Batas kandidat yang masuk ke reranker LLM (kontrol biaya/latensi)
    preRerankLimit: num(process.env.AGENT_RERANK_PRELIMIT, 12),
    // Jumlah minimal sumber DOKUMEN INTERNAL pada jawaban akhir (bila tersedia)
    minRagSources: num(process.env.AGENT_MIN_RAG_SOURCES, 2),
    // Sumber dokumen hanya "dipaksa masuk" bila relevansinya minimal sebesar ini
    // (mencegah dokumen tak relevan ikut tampil seperti kasus dokumen PNBP)
    minRagScore: num(process.env.AGENT_MIN_RAG_SCORE, 0.2)
  },

  rerank: {
    enabled: bool(process.env.AGENT_RERANK_ENABLED, true),
    // Rerank berbasis LLM (cross-encoder style). false → hybrid lexical+vector.
    useLlm: bool(process.env.AGENT_RERANK_LLM, true),
    timeoutMs: num(process.env.AGENT_RERANK_TIMEOUT_MS, 25000),
    maxTokens: num(process.env.AGENT_RERANK_MAX_TOKENS, 700),
    // Panjang potongan konten tiap kandidat yang dikirim ke reranker
    snippetChars: num(process.env.AGENT_RERANK_SNIPPET_CHARS, 700),
    weights: {
      vector: num(process.env.AGENT_W_VECTOR, 0.35),
      lexical: num(process.env.AGENT_W_LEXICAL, 0.25),
      llm: num(process.env.AGENT_W_LLM, 0.4)
    }
  },

  citation: {
    enabled: bool(process.env.CITATION_ENABLED, true),
    // Tambahkan daftar "Sumber:" di akhir jawaban bila LLM tidak menulis sitasi
    appendList: bool(process.env.CITATION_APPEND_LIST, true),
    // Batas jumlah sumber yang boleh disitasi
    maxSources: num(process.env.CITATION_MAX_SOURCES, 6)
  },

  llm: {
    answerMaxTokens: num(process.env.LLM_MAX_TOKENS, 4096),
    timeoutMs: num(process.env.AGENT_LLM_TIMEOUT_MS, 60000)
  }
});

module.exports = { config, num, bool, list };
