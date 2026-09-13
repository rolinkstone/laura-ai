const { searchChunks } = require('../vectorSearchService');
const { hasPromptInjection, hardenSystemPrompt } = require('./promptGuard');
const llmConfig = require('../llmConfigService');
const {
  PROVIDERS,
  getProviderOrder,
  getProvider,
  isProviderConfigured,
  getProviderModelName,
  summarizeProviderError
} = require('./llmRuntime');
const { buildLegacySystemPrompt } = require('./agent/prompts');
const { config: agentConfig } = require('./agent/config');
const { runAgent, runAgentStream } = require('./agent');

/**
 * RAG Engine — orchestrator LAURA.
 *
 * Terdapat DUA jalur:
 *  1. AI Agent (default, AGENT_ENABLED=true)
 *     Pertanyaan → PLANNER (LLM) → RAG ∥ WEB SEARCH → SOURCE SELECTION
 *     → RERANKER → LLM → jawaban + CITATION/SOURCE.
 *     Lihat `./agent/index.js` dan `backend/docs/agent-pipeline.md`.
 *  2. Legacy (AGENT_ENABLED=false)
 *     Pertanyaan → embedding → vector search → context → LLM → jawaban.
 *
 * Provider tunggal: 9Router (AI gateway OpenAI-compatible) via `llmRuntime.js`.
 */

/**
 * Bangun blok context dari chunk hasil vector search.
 * @param {Array} chunks
 * @returns {string}
 */
const buildContext = (chunks) => {
  if (!chunks || chunks.length === 0) {
    return '(tidak ada sumber relevan yang ditemukan)';
  }
  return chunks
    .map(
      (c, i) =>
        `SUMBER ${i + 1}\n` +
        `Judul   : ${c.document_title}\n` +
        `Halaman : ${c.page_number || 'tidak diketahui'}\n` +
        `Section : ${c.section || '-'}\n` +
        `---\n${c.content}`
    )
    .join('\n\n');
};

/**
 * Bangun system prompt sesuai kebutuhan BBPOM AI Assistant.
 * @param {string} context
 * @returns {string}
 */
const buildSystemPrompt = (context) => buildLegacySystemPrompt(context);

// ====================== Skrip LAURA (menu) ======================

const WELCOME_TEXT = `Halo! Selamat datang di Layanan Informasi Resmi BBPOM di Palangka Raya. 👋\n\nSaya LAURA (Asisten Layanan Aduan & Informasi Obat dan Makanan), asisten virtual yang siap membantu Anda mendapatkan informasi seputar Obat dan Makanan yang aman dan terpercaya.\n\nAda yang bisa LAURA bantu hari ini? Silakan pilih menu di bawah atau ketik pertanyaan Anda:\n1️⃣ Cek Produk & Izin Edar (Obat, Makanan, Kosmetik, Suplemen)\n2️⃣ Pengaduan & Laporan Produk (Kadaluwarsa, Tanpa Izin Edar, Berbahaya)\n3️⃣ Informasi Konsultasi & Layanan Publik\n4️⃣ Tips Konsumsi Aman & Cek KLIK\n\n(Balas dengan angka 1 - 4 atau ketik langsung pertanyaan Anda)`;

const MENU_RESPONSES = {
  '1': `Untuk memastikan produk Obat/Makanan/Kosmetik yang Anda gunakan terdaftar resmi:\n\n📍 Silakan kirimkan Nomor Registrasi (NIE) atau Nama Produk/Brand yang ingin Anda cek.\n\nAtau Anda juga bisa melakukan pengecekan mandiri melalui aplikasi Cek BPOM atau situs resmi cekbpom.pom.go.id.`,
  '2': `Laporan Anda sangat berharga untuk menjaga keselamatan bersama. 🛡️\n\nMohon lengkapi data laporan singkat berikut:\n\nNama Produk:\nLokasi Temuan/Pembelian:\nDetail Masalah: (Contoh: Rusak, Kadaluwarsa, Tidak Ada Izin Edar, Reaksi Simpang/Efek Samping)\nLampiran Foto: (jika ada)\n\nLaporan Anda akan diproses secara rahasia oleh tim petugas pengawas.`,
  '3': `Layanan konsultasi resmi beroperasi pada:\n\n🕒 Senin – Jumat | 08.00 – 15.30 WIB\n\nSilakan tuliskan pertanyaan atau kendala yang ingin Anda konsultasikan (misal: pengurusan izin edar, sertifikasi, atau layanan laboratorium). LAURA akan memberikan informasi dasar atau menyambungkan Anda dengan petugas layanan kami.`,
  '4': `Ingat selalu rumus Cek KLIK sebelum membeli produk Obat dan Makanan:\n\n📦 Kemasan – Pastikan dalam kondisi baik/tidak rusak\n🏷️ Label – Baca informasi produk dengan cermat\n📑 Izin Edar – Pastikan memiliki izin resmi BPOM\n📅 Kadaluwarsa – Cek tanggal batas aman penggunaan\n\nAda informasi spesifik lain yang ingin Anda ketahui?`
};

const CLOSING_TEXT = `Terima kasih telah menghubungi Layanan Informasi Resmi BBPOM di Palangka Raya. Semoga informasi yang LAURA berikan bermanfaat!\n\nLindungi diri dan keluarga dengan selalu menjadi konsumen cerdas. Sampai jumpa lagi! ✨`;

const MENU_ALIASES = {
  '1': ['cek produk', 'cek izin edar', 'nie', 'menu 1'],
  '2': ['pengaduan', 'laporan produk', 'aduan', 'menu 2'],
  '3': ['konsultasi', 'layanan publik', 'menu 3'],
  '4': ['cek klik', 'tips konsumsi', 'edukasi', 'menu 4']
};

/**
 * Deteksi respons skrip LAURA (menu 1-4 / ucapan penutup) tanpa RAG/LLM.
 * @param {string} question
 * @returns {{type: 'text', text: string}|null}
 */
const getScriptedResponse = (question) => {
  const raw = String(question || '').trim();
  const q = raw.toLowerCase();
  if (!q) return null;

  // Ucapan penutup / perpisahan
  if (/^(terima kasih|terimakasih|makasih|thanks|thank you|sampai jumpa|selesai|bye|dadah|sudah cukup)/.test(q)) {
    return { type: 'text', text: CLOSING_TEXT };
  }

  // Menu: angka / "menu N" / kata kunci singkat
  const short = q.length <= 60;
  for (const [key, aliases] of Object.entries(MENU_ALIASES)) {
    const hit =
      q === key ||
      q === `menu ${key}` ||
      q.startsWith(`menu ${key}`) ||
      (short && aliases.some((a) => q.includes(a)));
    if (hit) return { type: 'text', text: MENU_RESPONSES[key] };
  }
  return null;
};

/**
 * Pipeline RAG LEGACY (non-streaming) — dipakai saat AGENT_ENABLED=false.
 * @param {{question: string, limit?: number, categoryId?: number|null}} param
 * @returns {Promise<{answer: string, sources: Array, chunks: Array, modelUsed: string, tokensUsed: number, provider: string|null}>}
 */
const askLegacy = async ({ question, limit = null, categoryId = null }) => {
  // Respons menu LAURA tanpa RAG/LLM
  const scripted = getScriptedResponse(question);
  if (scripted) {
    return {
      answer: scripted.text,
      sources: [],
      chunks: [],
      modelUsed: 'laura',
      tokensUsed: 0,
      injected: false,
      provider: null
    };
  }

  const topK = limit ? Math.min(Number(limit), 10) : Number(process.env.SEARCH_RESULT_LIMIT) || 5;

  // Proteksi prompt injection
  const injected = hasPromptInjection(question);

  // 1. Vector search: embedding pertanyaan → cari chunk paling relevan
  const chunks = await searchChunks(question, { limit: topK, categoryId });

  // 2. Bangun context (SYSTEM + SOURCE) + perkuat keamanan
  const context = buildContext(chunks);
  const system = hardenSystemPrompt(buildSystemPrompt(context), injected);

  // 3. LLM — coba provider sesuai urutan, fallback bila gagal/limit
  let answer = null;
  let modelUsed = null;
  let tokensUsed = 0;
  let usedProvider = null;
  let lastErr = null;
  let llmError = null;

  if (llmConfig.isEnabled()) {
    for (const provider of getProviderOrder()) {
      if (!isProviderConfigured(provider)) continue;
      try {
        const result = await provider.chat({ system, user: question });
        answer = result.text;
        modelUsed = result.model;
        tokensUsed = result.tokensUsed || 0;
        usedProvider = provider.name;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`[AI] provider "${provider.name}" gagal, coba berikutnya: ${err.message}`);
      }
    }
  }

  if (!answer) {
    // LLM dinonaktifkan / semua provider gagal / belum dikonfigurasi
    const disabled = !llmConfig.isEnabled();
    modelUsed = disabled ? 'disabled' : 'error';
    llmError = disabled ? 'LLM dinonaktifkan' : summarizeProviderError(lastErr);
    if (chunks.length > 0) {
      answer = disabled
        ? `Asisten AI sedang dinonaktifkan. Berikut informasi paling relevan dari basis pengetahuan:\n\n${chunks[0].content}`
        : `Saya tidak dapat menghasilkan jawaban AI saat ini${lastErr ? ` (${summarizeProviderError(lastErr)})` : ''}. Berikut informasi paling relevan dari basis pengetahuan:\n\n${chunks[0].content}`;
    } else {
      answer = disabled
        ? 'Maaf, asisten AI sedang dinonaktifkan dan tidak ada informasi yang relevan.'
        : `Maaf, saya tidak dapat menghasilkan jawaban AI saat ini${lastErr ? ` (${summarizeProviderError(lastErr)})` : ''}.`;
    }
  }

  // 4. Sources (untuk response & sitasi)
  const sources = chunks.map((c) => ({
    title: c.document_title,
    page: c.page_number,
    section: c.section,
    score: c.score
  }));

  return { answer, sources, chunks, modelUsed, tokensUsed, llmError, injected, provider: usedProvider };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Entry point utama (non-streaming).
 *
 *  - Respons menu/skrip LAURA  : dijawab langsung tanpa RAG/LLM.
 *  - AGENT_ENABLED=true        : pipeline AI Agent (RAG + Web Search +
 *                                Source Selection + Reranker + Citation).
 *  - AGENT_ENABLED=false       : pipeline RAG legacy.
 *
 * @param {{question: string, limit?: number, categoryId?: number|null}} param
 * @returns {Promise<object>} jawaban + sources + citations
 */
const ask = async ({ question, limit = null, categoryId = null }) => {
  const scripted = getScriptedResponse(question);
  if (scripted) {
    return {
      answer: scripted.text,
      sources: [],
      citations: [],
      chunks: [],
      modelUsed: 'laura',
      tokensUsed: 0,
      injected: false,
      provider: null,
      agent: null
    };
  }

  if (agentConfig().enabled) {
    return runAgent({ question, limit, categoryId });
  }

  const legacy = await askLegacy({ question, limit, categoryId });
  return { ...legacy, citations: [], agent: null };
};

const splitIntoChunks = (text, size = 40) => {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};

/**
 * Pipeline RAG LEGACY versi streaming (SSE) — dipakai saat AGENT_ENABLED=false.
 *
 * Menghasilkan event:
 *  - { type: 'sources', sources }
 *  - { type: 'token', text }  (berulang)
 *  - { type: 'done', model }
 *
 * @param {{question: string, limit?: number, categoryId?: number|null}} param
 * @returns {AsyncGenerator<object>}
 */
async function* askStreamLegacy({ question, limit = null, categoryId = null }) {
  // Respons menu LAURA tanpa RAG/LLM
  const scripted = getScriptedResponse(question);
  if (scripted) {
    yield { type: 'sources', sources: [] };
    for (const piece of splitIntoChunks(scripted.text, 40)) {
      yield { type: 'token', text: piece };
      await sleep(15);
    }
    yield { type: 'done', model: 'laura' };
    return;
  }

  const topK = limit ? Math.min(Number(limit), 10) : Number(process.env.SEARCH_RESULT_LIMIT) || 5;

  // Proteksi prompt injection
  const injected = hasPromptInjection(question);

  // 1. Vector search
  const chunks = await searchChunks(question, { limit: topK, categoryId });
  const sources = chunks.map((c) => ({
    title: c.document_title,
    page: c.page_number,
    section: c.section,
    score: c.score
  }));

  yield { type: 'sources', sources };

  // 2. Context + keamanan
  const context = buildContext(chunks);
  const system = hardenSystemPrompt(buildSystemPrompt(context), injected);

  // 3. LLM streaming dengan fallback
  let lastErr = null;
  if (llmConfig.isEnabled()) {
    for (const provider of getProviderOrder()) {
      if (!isProviderConfigured(provider)) continue;
      let started = false; // deklarasi di luar try agar terlihat oleh catch
      try {
        for await (const token of provider.streamTokens({ system, user: question })) {
          started = true;
          yield { type: 'token', text: token };
        }
        yield { type: 'done', model: getProviderModelName(provider) };
        return;
      } catch (err) {
        if (started) throw err; // gagal di tengah stream → jangan lanjut
        lastErr = err;
        console.warn(`[AI] streaming "${provider.name}" gagal sebelum mulai, fallback: ${err.message}`);
      }
    }
  }

  // LLM dinonaktifkan / semua provider gagal / belum dikonfigurasi → fallback teks
  const disabled = !llmConfig.isEnabled();
  const model = disabled ? 'disabled' : 'error';
  const reason = summarizeProviderError(lastErr);
  const fallback = disabled
    ? chunks.length > 0
      ? `Asisten AI sedang dinonaktifkan. Berikut informasi paling relevan dari basis pengetahuan:\n\n${chunks[0].content}`
      : 'Maaf, asisten AI sedang dinonaktifkan dan tidak ada informasi yang relevan.'
    : chunks.length > 0
      ? `Saya tidak dapat menghasilkan jawaban AI saat ini${reason ? ` (${reason})` : ''}. Berikut informasi paling relevan dari basis pengetahuan:\n\n${chunks[0].content}`
      : `Maaf, saya tidak dapat menghasilkan jawaban AI saat ini${reason ? ` (${reason})` : ''}.`;

  for (const piece of splitIntoChunks(fallback, 40)) {
    yield { type: 'token', text: piece };
    await sleep(15);
  }
  yield { type: 'done', model, llmError: disabled ? 'LLM dinonaktifkan' : reason || null };
}

/**
 * Entry point streaming (SSE).
 *
 *  - Respons menu/skrip LAURA : dikirim sebagai token tanpa RAG/LLM.
 *  - AGENT_ENABLED=true       : pipeline AI Agent (event: plan → sources →
 *                               token → citations → done).
 *  - AGENT_ENABLED=false      : pipeline RAG legacy (sources → token → done).
 *
 * @param {{question: string, limit?: number, categoryId?: number|null}} param
 * @returns {AsyncGenerator<object>}
 */
async function* askStream({ question, limit = null, categoryId = null }) {
  const scripted = getScriptedResponse(question);
  if (scripted) {
    yield { type: 'sources', sources: [] };
    for (const piece of splitIntoChunks(scripted.text, 40)) {
      yield { type: 'token', text: piece };
      await sleep(15);
    }
    yield { type: 'done', model: 'laura', citations: [] };
    return;
  }

  if (agentConfig().enabled) {
    yield* runAgentStream({ question, limit, categoryId });
    return;
  }

  yield* askStreamLegacy({ question, limit, categoryId });
}

module.exports = {
  ask,
  askStream,
  askLegacy,
  askStreamLegacy,
  buildContext,
  buildSystemPrompt,
  getProvider,
  getProviderOrder,
  isProviderConfigured,
  getProviderModelName,
  getScriptedResponse,
  summarizeProviderError,
  PROVIDERS
};
