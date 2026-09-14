/**
 * AI AGENT — tahap perencanaan (planning).
 *
 * Tugas tahap ini (kotak "AI AGENT → LLM" pada diagram):
 *  1. Menentukan apakah pertanyaan perlu dijawab dari RAG (basis pengetahuan
 *     internal / PostgreSQL + pgvector) dan/atau dari WEB SEARCH (situs resmi).
 *  2. Menyusun query pencarian yang lebih baik (query rewriting) untuk kedua
 *     cabang, tanpa mengubah maksud pertanyaan pengguna.
 *
 * Hasil: { useRag, useWeb, queries, reason, source }
 *  - `source: 'llm'`      → hasil penalaran LLM
 *  - `source: 'heuristic'` → fallback aturan (LLM nonaktif/gagal/mengembalikan
 *                            JSON tidak valid). Pipeline TIDAK pernah gagal
 *                            hanya karena planner gagal.
 */

const { completeJson } = require('../llmRuntime');
const { config } = require('./config');

// Kata kunci yang menandakan informasi perlu data terbaru / di luar dokumen.
const WEB_TRIGGER_RE =
  /(terbaru|terkini|hari ini|saat ini|sekarang|update|berita|pengumuman|jadwal|jam (buka|layanan|operasional)|kontak|alamat|nomor telepon|link|tautan|website|situs|unduh|download|formulir|pendaftaran|persyaratan terbaru|tahun 20\d\d|20\d\d)/i;

// Pertanyaan yang jelas bersandar pada regulasi/dokumen internal.
const RAG_TRIGGER_RE =
  /(pasal|regulasi|peraturan|uu\b|pp\b|perka|nomor registrasi|nie\b|izin edar|kandungan|kategori|takaran|ambang|ketentuan|prosedur|sop|persyaratan)/i;

/**
 * Nomor izin edar / nomor registrasi (NIE), mis. GKL1713713144A1, MD 1234567890123,
 * DKL1234567890. Sengaja case-sensitive pada bagian huruf agar kalimat seperti
 * "Pasal 1234567" tidak ikut dianggap nomor registrasi.
 */
const REG_NUMBER_RE = /\b[A-Z]{2,5}[\s.-]?\d{6,}[\w-]*/;

/**
 * Pertanyaan yang intinya meminta PENGECEKAN produk/izin edar.
 * Catatan: istilah "izin edar"/"NIE" saja TIDAK cukup (banyak pertanyaan
 * informasional seperti "apa persyaratan izin edar?" yang cukup dijawab dari
 * dokumen internal). Harus ada kata kerja pengecekan atau nomor/nomor registrasi.
 */
const PRODUCT_CHECK_RE =
  /(cek|periksa|verifikasi|validasi|pastikan|lacak|telusuri)[^.]{0,30}(produk|obat|kosmetik|pangan|suplemen|makanan|minuman|jamu|nie|izin\s*edar|nomor\s*registrasi)|(nomor|no\.?|nomer)\s*(reg|registrasi|rek|izin\s*edar|nie)|\bnie\b/i;

const STOP_FILLER_RE = /^(tolong|mohon|silakan|coba|bisa|bisakah|apa|apakah|berapa|bagaimana|dimana|di mana|kapan|siapa|mengapa|kenapa)\b[\s,]*/i;

const URL_RE = /https?:\/\/[^\s"'<>()]+/gi;

/**
 * Ambil semua URL yang disebut pengguna.
 * @param {string} question
 * @returns {string[]}
 */
const extractUrls = (question) => {
  const found = String(question || '').match(URL_RE) || [];
  return [...new Set(found.map((u) => u.replace(/[.,;]+$/, '')))];
};

/**
 * Bersihkan query pencarian hasil LLM / heuristik.
 * @param {string} raw
 * @returns {string}
 */
const cleanQuery = (raw) =>
  String(raw || '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

/**
 * Susun query pencarian heuristik dari pertanyaan pengguna.
 * @param {string} question
 * @returns {string[]}
 */
const deriveQueries = (question) => {
  const q = cleanQuery(question);
  if (!q) return [];
  const keywords = cleanQuery(q.replace(STOP_FILLER_RE, ''));
  const queries = [q];
  if (keywords && keywords.toLowerCase() !== q.toLowerCase()) queries.push(keywords);
  return [...new Set(queries)].slice(0, 2);
};

/**
 * Apakah pertanyaan menyebut nomor izin edar/registrasi?
 * @param {string} text
 * @returns {boolean}
 */
const looksLikeRegistrationNumber = (text) => REG_NUMBER_RE.test(String(text || ''));

/**
 * Apakah pertanyaan meminta pengecekan produk (butuh data resmi terbaru)?
 * @param {string} text
 * @returns {boolean}
 */
const isProductCheckQuestion = (text) => PRODUCT_CHECK_RE.test(String(text || ''));

/**
 * Rencana berbasis aturan (fallback + saat planner LLM nonaktif).
 * @param {string} question
 * @returns {{useRag: boolean, useWeb: boolean, queries: string[], reason: string,
 *            source: 'heuristic', productCheck: boolean, regNumber: boolean, standalone: string}}
 */
const heuristicPlan = (question) => {
  const text = String(question || '');
  const urls = extractUrls(text);
  const regNumber = looksLikeRegistrationNumber(text);
  const productCheck = isProductCheckQuestion(text);

  // Pengecekan produk / nomor registrasi WAJIB mencari ke web (data resmi terbaru),
  // karena dokumen internal hampir tidak pernah memuat nomor NIE spesifik.
  const wantsWeb = urls.length > 0 || WEB_TRIGGER_RE.test(text) || regNumber || productCheck;
  const wantsRag = RAG_TRIGGER_RE.test(text);

  return {
    // Pertanyaan yang menyebut URL hampir selalu butuh pembacaan halaman web.
    useRag: urls.length === 0 || wantsRag,
    useWeb: wantsWeb,
    queries: urls.length > 0 ? urls.slice(0, 2) : deriveQueries(text),
    // Tanpa LLM, pertanyaan dipakai apa adanya (tidak ada penulisan ulang).
    standalone: cleanQuery(text),
    reason:
      urls.length > 0
        ? 'pertanyaan memuat URL'
        : regNumber
          ? 'pertanyaan memuat nomor izin edar/registrasi → cek ke situs resmi'
          : productCheck
            ? 'pertanyaan meminta pengecekan produk → cari data resmi terbaru'
            : WEB_TRIGGER_RE.test(text)
              ? 'kata kunci menandakan informasi terkini/eksternal'
              : wantsRag
                ? 'pertanyaan tentang ketentuan/regulasi → basis pengetahuan'
                : 'default: basis pengetahuan internal',
    source: 'heuristic',
    productCheck,
    regNumber
  };
};

const PLANNER_SYSTEM = `Anda adalah komponen PLANNER dari AI Agent "LAURA" (asisten resmi BBPOM di Palangka Raya).
Tugas: menentukan lokasi informasi paling tepat untuk menjawab pertanyaan pengguna.

Kanal yang tersedia:
- "rag": basis pengetahuan internal (dokumen resmi, peraturan, SOP, FAQ yang sudah diunggah).
- "web": pencarian di situs resmi (pemerintah/instansi) untuk informasi terkini, kontak, jadwal layanan, pengumuman, tautan unduhan.

Aturan:
1. Pilih salah satu atau keduanya. Boleh keduanya bila pertanyaan mencampur ketentuan dokumen dengan informasi terkini.
2. Jangan pakai "web" untuk pertanyaan konsep/ketentuan yang jelas ada di dokumen resmi, kecuali pengguna meminta hal terbaru/eksternal.
3. "queries" = 1-2 query pencarian singkat (maks 15 kata) dalam Bahasa Indonesia. Pertahankan istilah teknis/nama produk.
4. Bila ada RIWAYAT PERCAKAPAN dan pertanyaan pengguna adalah LANJUTAN (mis. hanya menyebut nama produk/topik tanpa pertanyaan lengkap), tulis "standalone" = pertanyaan lengkap yang berdiri sendiri dengan menyebut topik dari riwayat, dan sertakan topik itu juga pada "queries". Bila tidak ada riwayat atau pertanyaan sudah lengkap, "standalone" = pertanyaan pengguna apa adanya.
5. Balas HANYA JSON valid, tanpa penjelasan tambahan.

Format:
{"use_rag": true, "use_web": false, "queries": ["..."], "standalone": "...", "reason": "alasan singkat"}`;

/**
 * Ringkas riwayat percakapan untuk prompt planner.
 * @param {Array<{role: string, content: string}>} history
 * @returns {string} blok teks (kosong bila tidak ada riwayat)
 */
const historyBlock = (history = []) => {
  const messages = (Array.isArray(history) ? history : []).filter((m) => m && m.content);
  if (messages.length === 0) return '';

  const lines = messages.map(
    (m) => `${m.role === 'assistant' ? 'LAURA' : 'Pengguna'}: ${String(m.content).slice(0, 500)}`
  );
  return `\n\nRIWAYAT PERCAKAPAN (lama → baru):\n${lines.join('\n')}`;
};

/**
 * Buat rencana eksekusi agent.
 *
 * @param {{question: string, categoryId?: number|null,
 *          history?: Array<{role: string, content: string}>}} param
 * @returns {Promise<{useRag: boolean, useWeb: boolean, queries: string[], reason: string,
 *                    source: 'llm'|'heuristic', standalone: string, durationMs: number}>}
 */
const plan = async ({ question, categoryId = null, history = [] }) => {
  const cfg = config();
  const startedAt = Date.now();

  if (!cfg.planner.enabled) {
    return { ...heuristicPlan(question), durationMs: Date.now() - startedAt };
  }

  const fallback = heuristicPlan(question);
  const urls = extractUrls(question);

  try {
    const { data } = await completeJson({
      system: PLANNER_SYSTEM,
      user: `Pertanyaan pengguna: ${question}${historyBlock(history)}${
        categoryId ? `\nFilter kategori dokumen (id): ${categoryId}` : ''
      }${urls.length ? `\nURL yang disebut pengguna: ${urls.join(', ')}` : ''}`,
      maxTokens: cfg.planner.maxTokens,
      temperature: 0,
      timeoutMs: cfg.planner.timeoutMs,
      label: 'planner'
    });

    if (!data || typeof data !== 'object') throw new Error('JSON planner tidak valid');

    const useRag = data.use_rag === undefined ? fallback.useRag : !!data.use_rag;
    // Jaring pengaman: pengecekan produk / nomor registrasi SELALU ikut cari ke web
    // walau planner LLM memutuskan sebaliknya.
    const useWeb = fallback.productCheck || fallback.regNumber ? true : data.use_web === undefined ? fallback.useWeb : !!data.use_web;

    let queries = Array.isArray(data.queries)
      ? data.queries.map(cleanQuery).filter(Boolean).slice(0, 2)
      : [];
    if (queries.length === 0) queries = fallback.queries;
    // URL yang disebut pengguna harus tetap dibaca (prioritas tertinggi).
    if (urls.length > 0) queries = [...new Set([...urls.slice(0, 2), ...queries])].slice(0, 3);

    // Pertanyaan versi mandiri (konteks percakapan sudah dimasukkan) — dipakai
    // untuk pencarian RAG & penilaian relevansi pada pertanyaan lanjutan.
    const standalone = String(data.standalone || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    return {
      // Jangan izinkan planner mematikan kedua kanal (menghindari jawaban kosong).
      useRag: useRag || (!useRag && !useWeb),
      useWeb: useWeb && cfg.web.enabled,
      queries,
      standalone: standalone || fallback.standalone || cleanQuery(question),
      reason: cleanQuery(data.reason).slice(0, 200) || fallback.reason,
      source: 'llm',
      productCheck: fallback.productCheck,
      regNumber: fallback.regNumber,
      durationMs: Date.now() - startedAt
    };
  } catch (err) {
    console.warn(`[agent:planner] fallback ke heuristik: ${err.message}`);
    return {
      ...fallback,
      standalone: fallback.standalone || cleanQuery(question),
      useWeb: fallback.useWeb && cfg.web.enabled,
      durationMs: Date.now() - startedAt
    };
  }
};

/**
 * Perlu naik ke web search karena RAG tidak menemukan sumber relevan?
 * @param {Array} ragCandidates
 * @returns {boolean}
 */
const shouldEscalateToWeb = (ragCandidates) => !ragCandidates || ragCandidates.length === 0;

module.exports = {
  plan,
  heuristicPlan,
  shouldEscalateToWeb,
  extractUrls,
  deriveQueries,
  looksLikeRegistrationNumber,
  isProductCheckQuestion,
  WEB_TRIGGER_RE,
  REG_NUMBER_RE,
  PRODUCT_CHECK_RE
};
