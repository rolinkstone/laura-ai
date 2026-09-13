/**
 * AI AGENT — orkestrator pipeline LAURA.
 *
 * Implementasi diagram:
 *
 *   ASISTEN LAURA
 *        │
 *        ▼
 *   AI AGENT  ──►  LLM (planning: butuh RAG? butuh WEB? query apa?)
 *        │
 *        ├── RAG ──────────► PostgreSQL (dokumen + embedding/pgvector)
 *        └── WEB SEARCH ──► Official Websites (situs resmi)
 *                    │
 *                    ▼
 *            Source Selection   (dedupe, kebijakan sumber resmi, keragaman)
 *                    │
 *                    ▼
 *                Reranker       (vector + lexical + LLM relevance)
 *                    │
 *                    ▼
 *                  LLM          (jawaban akhir dengan sitasi [n])
 *                    │
 *                    ▼
 *             Final Answer
 *                    │
 *            ┌───────┴────────┐
 *            ▼                ▼
 *        Citation          Source
 *
 * Semua tahap memiliki fallback: kegagalan web search / LLM planner /
 * reranker LLM tidak boleh membuat permintaan chat gagal.
 */

const { searchChunks } = require('../../vectorSearchService');
const { hasPromptInjection, hardenSystemPrompt } = require('../promptGuard');
const { complete, streamCompletion, summarizeProviderError } = require('../llmRuntime');
const { config } = require('./config');
const { plan } = require('./planner');
const { webSearch } = require('./webSearch.service');
const { selectSources, toPublicSources } = require('./sourceSelector');
const { rerank } = require('./reranker');
const { finalizeCitations } = require('./citations');
const { buildAgentSystemPrompt } = require('./prompts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const splitIntoChunks = (text, size = 40) => {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};

/**
 * Tanggal akses sumber web (Bahasa Indonesia).
 * @returns {string}
 */
const accessDateId = () =>
  new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Apakah kumpulan sumber dianggap LEMAH (tidak layak dijadikan dasar jawaban)?
 *
 * Lemah bila:
 *  - tidak ada sumber sama sekali, ATAU
 *  - skor rerank terbaik < `AGENT_MIN_TOP_SCORE` (default 0.35), ATAU
 *  - semua sumber dinilai 0 relevan oleh reranker LLM.
 *
 * Contoh nyata: pertanyaan nomor registrasi obat dijawab dari dokumen "Biaya
 * PNBP" (skor ~0.5, relevansi LLM 0) — sumber seperti ini harus memicu web search.
 *
 * @param {Array} ranked
 * @param {object} cfg hasil `config()`
 * @returns {boolean}
 */
const isWeakSources = (ranked, cfg) => {
  if (!ranked || ranked.length === 0) return true;

  const best = Number(ranked[0].rerank_score) || 0;
  if (best < cfg.selection.minTopScore) return true;

  const llmScores = ranked.map((c) => c.signals?.llm).filter((v) => typeof v === 'number');
  return llmScores.length > 0 && llmScores.every((v) => v === 0);
};

/**
 * Jalankan cabang RAG + WEB SEARCH, lalu Source Selection + Reranker.
 *
 * @param {{question: string, limit?: number|null, categoryId?: number|null}} param
 * @returns {Promise<object>} hasil pengumpulan sumber + jejak (trace) tiap tahap
 */
const collectSources = async ({ question, limit = null, categoryId = null }) => {
  const cfg = config();
  const trace = [];

  const topK = Math.max(1, Math.min(Number(limit) || cfg.selection.topK, 10));
  // Kandidat RAG lebih banyak dari topK — reranker yang memangkas.
  const ragLimit = Math.max(topK * 2, cfg.rag.candidates);

  // ── 1. PLANNER (AI AGENT → LLM) ─────────────────────────────────────────
  const planResult = await plan({ question, categoryId });
  trace.push({
    stage: 'plan',
    ms: planResult.durationMs,
    source: planResult.source,
    useRag: planResult.useRag,
    useWeb: planResult.useWeb,
    queries: planResult.queries,
    reason: planResult.reason
  });

  // ── 2. Cabang RAG & WEB SEARCH (paralel) ────────────────────────────────
  const ragPromise = planResult.useRag
    ? searchChunks(question, { limit: ragLimit, categoryId }).catch((err) => {
        console.warn(`[agent:rag] gagal: ${err.message}`);
        return [];
      })
    : Promise.resolve([]);

  const webPromise =
    planResult.useWeb && cfg.web.enabled
      ? webSearch({ queries: planResult.queries, limit: cfg.web.results }).catch((err) => {
          console.warn(`[agent:web] gagal: ${err.message}`);
          return { results: [], provider: null, notes: [err.message] };
        })
      : Promise.resolve({ results: [], provider: null, notes: ['tidak dijalankan'] });

  const ragStartedAt = Date.now();
  const webStartedAt = Date.now();
  let [ragChunks, web] = await Promise.all([ragPromise, webPromise]);
  trace.push({ stage: 'rag', ms: Date.now() - ragStartedAt, count: ragChunks.length });
  trace.push({ stage: 'web', ms: Date.now() - webStartedAt, provider: web.provider, count: web.results.length, notes: web.notes });

  // ── 2b. Eskalasi adaptif: RAG kosong → coba web search ──────────────────
  let escalated = false;
  if (ragChunks.length === 0 && !planResult.useWeb && cfg.web.enabled) {
    const startedAt = Date.now();
    web = await webSearch({ queries: planResult.queries, limit: cfg.web.results }).catch((err) => {
      console.warn(`[agent:web] eskalasi gagal: ${err.message}`);
      return { results: [], provider: null, notes: [err.message] };
    });
    escalated = true;
    trace.push({
      stage: 'web-escalation',
      ms: Date.now() - startedAt,
      provider: web.provider,
      count: web.results.length,
      notes: web.notes
    });
  }

  // ── 3+4. SOURCE SELECTION + RERANKER (dipakai juga saat eskalasi) ───────
  /**
   * Tahap selection → rerank untuk sekumpulan kandidat.
   * @param {Array} rag
   * @param {Array} webResults
   * @param {string} label penanda di trace
   * @returns {Promise<{ranked: Array, dropped: object, signals: string[]}>}
   */
  const rankStage = async (rag, webResults, label = '') => {
    const selectStartedAt = Date.now();
    const { candidates, dropped } = selectSources({ ragChunks: rag, webResults });
    trace.push({
      stage: label ? `select:${label}` : 'select',
      ms: Date.now() - selectStartedAt,
      count: candidates.length,
      dropped
    });

    const rerankStartedAt = Date.now();
    const { candidates: rankedCandidates, usedSignals } = await rerank({ question, candidates, topN: topK });
    trace.push({
      stage: label ? `rerank:${label}` : 'rerank',
      ms: Date.now() - rerankStartedAt,
      count: rankedCandidates.length,
      signals: usedSignals
    });

    return { ranked: rankedCandidates, dropped, signals: usedSignals };
  };

  let { ranked, dropped, signals: usedSignals } = await rankStage(ragChunks, web.results);

  // ── 5. Eskalasi karena SUMBER LEMAH ────────────────────────────────────
  // Dokumen internal bisa "lolos" ambang skor minimum vector search padahal
  // tidak relevan (mis. dokumen biaya PNBP untuk pertanyaan nomor registrasi).
  // Bila sumber RAG lemah → cari ke web, lalu gabungkan & rerank ulang.
  let escalationReason = escalated ? 'rag-kosong' : null;
  if (
    !escalated &&
    !planResult.useWeb &&
    cfg.web.enabled &&
    cfg.web.escalateOnWeak &&
    isWeakSources(ranked, cfg) &&
    ragChunks.length > 0
  ) {
    const startedAt = Date.now();
    web = await webSearch({ queries: planResult.queries, limit: cfg.web.results }).catch((err) => {
      console.warn(`[agent:web] eskalasi (sumber lemah) gagal: ${err.message}`);
      return { results: [], provider: null, notes: [err.message] };
    });
    escalated = true;
    escalationReason = 'sumber-lemah';
    trace.push({
      stage: 'web-escalation',
      ms: Date.now() - startedAt,
      reason: 'sumber-rag-lemah',
      provider: web.provider,
      count: web.results.length,
      notes: web.notes
    });

    if (web.results.length > 0) {
      ({ ranked, dropped, signals: usedSignals } = await rankStage(ragChunks, web.results, 'gabungan'));
    }
  }

  // Sumber tetap lemah? Tandai agar LLM tidak memaksakan jawaban.
  const weakSources = isWeakSources(ranked, cfg);
  trace.push({ stage: 'quality', weakSources, best: ranked[0]?.rerank_score ?? 0 });

  // Sumber lemah ditandai di respons agar UI bisa memberi keterangan
  const sources = toPublicSources(ranked, topK).map((s) => (weakSources ? { ...s, weak: true } : s));

  return {
    plan: planResult,
    escalated,
    escalationReason,
    weakSources,
    ragChunks,
    web,
    ranked,
    sources,
    dropped,
    trace,
    route: {
      useRag: planResult.useRag,
      useWeb: planResult.useWeb || escalated,
      webProvider: web.provider,
      // Lingkup domain sumber web (audit: link apa saja yang boleh dipakai)
      webScope: web.scope || null,
      webNotes: web.notes || [],
      ragChunks: ragChunks.length,
      webResults: web.results.length,
      sourcesUsed: sources.length,
      // Kualitas sumber terbaik (0..1) + apakah sumber dianggap lemah
      bestScore: ranked[0]?.rerank_score ?? 0,
      weakSources,
      escalationReason
    },
    webUsed: ranked.some((c) => c.origin === 'web'),
    accessDate: accessDateId()
  };
};

/**
 * Teks jawaban fallback saat LLM tidak tersedia/gagal.
 * @param {{err: Error|null, chunks: Array}} param
 * @returns {string}
 */
const buildFallbackAnswer = ({ err, chunks }) => {
  const disabled = !err || err.code === 'LLM_DISABLED';
  const reason = err && err.code !== 'LLM_DISABLED' ? summarizeProviderError(err.cause || err) : '';
  const best = chunks && chunks.length > 0 ? chunks[0] : null;

  if (disabled) {
    return best
      ? `Asisten AI sedang dinonaktifkan. Berikut informasi paling relevan dari basis pengetahuan:\n\n${best.content}`
      : 'Maaf, asisten AI sedang dinonaktifkan dan tidak ada informasi yang relevan.';
  }
  return best
    ? `Saya tidak dapat menghasilkan jawaban AI saat ini${reason ? ` (${reason})` : ''}. Berikut informasi paling relevan dari basis pengetahuan:\n\n${best.content}`
    : `Maaf, saya tidak dapat menghasilkan jawaban AI saat ini${reason ? ` (${reason})` : ''}.`;
};

/**
 * System prompt agent + penguatan keamanan.
 * @param {object} collected hasil `collectSources()`
 * @param {string} question
 * @returns {string}
 */
const buildSystemPromptFor = (collected, question) =>
  hardenSystemPrompt(
    buildAgentSystemPrompt({
      sources: collected.ranked,
      accessDate: collected.accessDate,
      webUsed: collected.webUsed,
      // Sumber lemah → LLM diminta tidak memaksakan jawaban dari sumber itu
      weakSources: !!collected.weakSources
    }),
    hasPromptInjection(question)
  );

/**
 * Jalankan pipeline AI Agent (non-streaming).
 *
 * @param {{question: string, limit?: number|null, categoryId?: number|null}} param
 * @returns {Promise<{answer, sources, citations, chunks, modelUsed, tokensUsed, injected, provider, agent}>}
 */
const runAgent = async ({ question, limit = null, categoryId = null }) => {
  const cfg = config();
  const collected = await collectSources({ question, limit, categoryId });
  const injected = hasPromptInjection(question);
  const system = buildSystemPromptFor(collected, question);

  let answer = null;
  let modelUsed = null;
  let tokensUsed = 0;
  let usedProvider = null;

  // ── 5. LLM (generate jawaban bersitasi) ────────────────────────────────
  const llmStartedAt = Date.now();
  try {
    const result = await complete({
      system,
      user: question,
      maxTokens: cfg.llm.answerMaxTokens,
      timeoutMs: cfg.llm.timeoutMs,
      label: 'answer'
    });
    answer = result.text;
    modelUsed = result.model;
    tokensUsed = result.tokensUsed || 0;
    usedProvider = result.provider;
  } catch (err) {
    console.warn(`[agent:answer] gagal: ${err.message}`);
    answer = buildFallbackAnswer({ err, chunks: collected.ragChunks });
    modelUsed = err.code === 'LLM_DISABLED' ? 'disabled' : 'not-configured';
  }
  collected.trace.push({ stage: 'generate', ms: Date.now() - llmStartedAt, model: modelUsed, provider: usedProvider });

  // ── 6. CITATION + SOURCE ───────────────────────────────────────────────
  const cited = finalizeCitations({ answer, sources: collected.ranked, weakSources: collected.weakSources });

  return {
    answer: cited.answer,
    sources: collected.sources,
    citations: cited.citations,
    chunks: collected.ragChunks,
    modelUsed,
    tokensUsed,
    llmError,
    injected,
    provider: usedProvider,
    agent: {
      route: collected.route,
      plan: { useRag: collected.plan.useRag, useWeb: collected.plan.useWeb, queries: collected.plan.queries, reason: collected.plan.reason, source: collected.plan.source },
      web: { provider: collected.web.provider, notes: collected.web.notes, results: collected.web.results.length, scope: collected.web.scope || null },
      usedSignals: collected.trace.find((t) => t.stage === 'rerank')?.signals || [],
      weakSources: collected.weakSources,
      escalationReason: collected.escalationReason,
      dropped: collected.dropped,
      trace: collected.trace
    }
  };
};

/**
 * Pipeline AI Agent versi streaming (SSE).
 *
 * Menghasilkan event:
 *  - { type: 'plan', ... }         (opsional, info tahap perencanaan)
 *  - { type: 'sources', sources }  (dikirim SEBELUM jawaban)
 *  - { type: 'token', text }       (berulang)
 *  - { type: 'citations', citations }
 *  - { type: 'done', model, provider, citations, trace }
 *
 * @param {{question: string, limit?: number|null, categoryId?: number|null}} param
 * @returns {AsyncGenerator<object>}
 */
async function* runAgentStream({ question, limit = null, categoryId = null }) {
  const cfg = config();
  const collected = await collectSources({ question, limit, categoryId });
  const system = buildSystemPromptFor(collected, question);

  yield {
    type: 'plan',
    route: collected.route,
    reason: collected.plan.reason,
    queries: collected.plan.queries,
    weakSources: collected.weakSources,
    escalation: collected.escalationReason
  };
  yield { type: 'sources', sources: collected.sources };

  let fullAnswer = '';
  let model = null;
  let providerName = null;
  let llmError = null;
  const llmStartedAt = Date.now();

  try {
    for await (const evt of streamCompletion({
      system,
      user: question,
      timeoutMs: cfg.llm.timeoutMs,
      label: 'answer-stream'
    })) {
      if (evt.token) {
        fullAnswer += evt.token;
        yield { type: 'token', text: evt.token };
      } else if (evt.done) {
        model = evt.model;
        providerName = evt.provider;
      }
    }
  } catch (err) {
    // Sebagian token mungkin sudah terkirim (gagal di tengah stream) → jangan
    // menambahkan teks fallback yang membingungkan; cukup hentikan dengan error.
    if (fullAnswer) {
      collected.trace.push({ stage: 'generate', ms: Date.now() - llmStartedAt, error: err.message });
      throw err;
    }
    console.warn(`[agent:answer-stream] gagal: ${err.message}`);
    const fallback = buildFallbackAnswer({ err, chunks: collected.ragChunks });
    model = err.code === 'LLM_DISABLED' ? 'disabled' : 'error';
    llmError = err.code === 'LLM_DISABLED' ? 'LLM dinonaktifkan' : summarizeProviderError(err.cause || err);
    for (const piece of splitIntoChunks(fallback, 40)) {
      fullAnswer += piece;
      yield { type: 'token', text: piece };
      await sleep(15);
    }
  }
  collected.trace.push({ stage: 'generate', ms: Date.now() - llmStartedAt, model, provider: providerName });

  // Sitasi TIDAK menulis ulang isi jawaban pada mode streaming (isi sudah
  // terkirim ke pengguna); hanya daftar sumber yang bisa ditambahkan di akhir.
  const cited = finalizeCitations({
    answer: fullAnswer,
    sources: collected.ranked,
    rewriteRefs: false,
    weakSources: collected.weakSources
  });

  if (cited.answer.length > fullAnswer.trim().length && cited.answer.startsWith(fullAnswer.trim())) {
    const tail = cited.answer.slice(fullAnswer.trim().length);
    for (const piece of splitIntoChunks(tail, 60)) {
      yield { type: 'token', text: piece };
      await sleep(10);
    }
  }

  if (cited.citations.length > 0) yield { type: 'citations', citations: cited.citations };

  yield {
    type: 'done',
    model,
    provider: providerName,
    llmError,
    sources: collected.sources,
    citations: cited.citations,
    route: collected.route,
    trace: collected.trace
  };
}

module.exports = { runAgent, runAgentStream, collectSources, buildFallbackAnswer, buildSystemPromptFor };
