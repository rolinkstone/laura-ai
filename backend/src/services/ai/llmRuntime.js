/**
 * LLM Runtime — lapisan provider-agnostic.
 *
 * Dipakai oleh:
 *  - `ai.service.js` (orchestrator RAG/legacy)
 *  - `agent/*` (AI Agent: planner, reranker, generator)
 *
 * Semua pemanggilan LLM melewati modul ini agar urutan provider + fallback
 * hanya didefinisikan SATU kali. Tidak ada dependency ke `ai.service.js`
 * sehingga tidak menimbulkan circular require.
 *
 * Provider tunggal: 9Router (AI gateway OpenAI-compatible) — 1 API key
 * merutekan ke banyak model/provider.
 */

const llmConfig = require('../llmConfigService');
const ninerouterProvider = require('./ninerouter.provider');

const PROVIDERS = {
  ninerouter: ninerouterProvider
};

/**
 * Urutan provider dari pengaturan runtime (dashboard) / env AI_PROVIDER.
 * @returns {Array<{name: string}>}
 */
const getProviderOrder = () => {
  const names = llmConfig.getProviderOrder();
  const ordered = [];
  for (const n of names) {
    const p = PROVIDERS[n.toLowerCase()];
    if (p && !ordered.includes(p)) ordered.push(p);
  }
  if (ordered.length === 0) ordered.push(ninerouterProvider);
  return ordered;
};

// Kompatibilitas lama
const getProvider = () => getProviderOrder()[0];

const isProviderConfigured = (provider) => {
  if (llmConfig.isProviderConfigured(provider.name)) return true;
  // Gateway 9Router lokal tanpa API key (opsional, untuk deployment lokal)
  return provider.name === 'ninerouter' && !!process.env.NINEROUTER_BASE_URL;
};

const getProviderModelName = (provider) => llmConfig.getModel(provider.name) || 'kr/auto';

/**
 * Rangkum error provider LLM jadi pesan singkat yang jelas.
 * @param {Error|null} err
 * @returns {string}
 */
const summarizeProviderError = (err) => {
  if (!err) return '';
  const msg = String(err.message || '');
  const m = msg.match(/API error (\d{3})/);
  const status = m ? m[1] : null;
  if (status === '429') return 'kuota/rate limit provider AI habis (429) — periksa billing/kuota';
  if (status === '401' || status === '403') return 'API key provider AI tidak valid';
  if (status) return `provider AI error ${status}`;
  if (/timeout|abort/i.test(msg)) return 'provider AI tidak merespons (timeout)';
  return msg.split('\n')[0].slice(0, 120) || 'kesalahan provider AI';
};

/**
 * Buat Error dengan kode yang mudah dibedakan pemanggil.
 */
const llmError = (message, code, cause = null) => {
  const err = new Error(message);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
};

/**
 * Panggil LLM (non-streaming) dengan fallback antar provider.
 *
 * @param {{system: string, user: string, history?: Array<{role: string, content: string}>,
 *          maxTokens?: number|null, temperature?: number|null,
 *          timeoutMs?: number|null, label?: string}} param
 * @returns {Promise<{text: string, model: string, tokensUsed: number, provider: string}>}
 */
const complete = async ({ system, user, history = [], maxTokens = null, temperature = null, timeoutMs = null, label = 'llm' }) => {
  let lastErr = null;

  if (llmConfig.isEnabled()) {
    for (const provider of getProviderOrder()) {
      if (!isProviderConfigured(provider)) continue;
      try {
        const result = await provider.chat({ system, user, history, maxTokens, temperature, timeoutMs });
        if (!result || !result.text) throw new Error('Provider mengembalikan jawaban kosong');
        return {
          text: result.text,
          model: result.model || getProviderModelName(provider),
          tokensUsed: result.tokensUsed || 0,
          provider: provider.name
        };
      } catch (err) {
        lastErr = err;
        console.warn(`[LLM:${label}] provider "${provider.name}" gagal, coba berikutnya: ${err.message}`);
      }
    }
  }

  const disabled = !llmConfig.isEnabled();
  throw llmError(
    disabled ? 'LLM dinonaktifkan' : `Semua provider LLM gagal (${summarizeProviderError(lastErr)})`,
    disabled ? 'LLM_DISABLED' : 'LLM_FAILED',
    lastErr
  );
};

/**
 * Ambil JSON pertama yang valid dari teks LLM (tahan terhadap code fence
 * ```json ... ``` dan teks penjelasan di luar JSON).
 *
 * @param {string} text
 * @returns {any|null}
 */
const parseJsonLoose = (text) => {
  if (!text) return null;
  const raw = String(text).trim();

  const candidates = [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  candidates.push(raw);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // lanjut ke ekstraksi blok { } / [ ] pertama
    }
    const start = candidate.search(/[[{]/);
    if (start === -1) continue;
    const open = candidate[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
      const ch = candidate[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
};

/**
 * Panggil LLM dan harapkan JSON.
 *
 * @param {{system: string, user: string, maxTokens?: number|null,
 *          temperature?: number|null, timeoutMs?: number|null, label?: string}} param
 * @returns {Promise<{data: any|null, raw: string, model: string, tokensUsed: number, provider: string}>}
 */
const completeJson = async (params) => {
  const result = await complete(params);
  return { ...result, data: parseJsonLoose(result.text) };
};

/**
 * Streaming LLM dengan fallback provider (fallback hanya bila provider gagal
 * SEBELUM menghasilkan token — output yang sudah terkirim tidak boleh terpotong).
 *
 * Menghasilkan:
 *  - { token: string }                      (berulang)
 *  - { done: true, model, provider }        (terakhir, bila sukses)
 * Melempar error (code LLM_DISABLED / LLM_FAILED) bila tidak ada provider yang
 * berhasil — pemanggil bertanggung jawab membuat teks fallback.
 *
 * @param {{system: string, user: string, history?: Array<{role: string, content: string}>,
 *          timeoutMs?: number|null, label?: string}} param
 * @returns {AsyncGenerator<object>}
 */
async function* streamCompletion({ system, user, history = [], timeoutMs = null, label = 'llm' }) {
  let lastErr = null;

  if (llmConfig.isEnabled()) {
    for (const provider of getProviderOrder()) {
      if (!isProviderConfigured(provider)) continue;
      let started = false; // di luar try agar terlihat catch
      try {
        for await (const token of provider.streamTokens({ system, user, history, timeoutMs })) {
          started = true;
          yield { token };
        }
        yield { done: true, model: getProviderModelName(provider), provider: provider.name };
        return;
      } catch (err) {
        if (started) throw err; // gagal di tengah stream → jangan lanjut
        lastErr = err;
        console.warn(`[LLM:${label}] streaming "${provider.name}" gagal sebelum mulai, fallback: ${err.message}`);
      }
    }
  }

  const disabled = !llmConfig.isEnabled();
  throw llmError(
    disabled ? 'LLM dinonaktifkan' : `Semua provider LLM gagal (${summarizeProviderError(lastErr)})`,
    disabled ? 'LLM_DISABLED' : 'LLM_FAILED',
    lastErr
  );
}

module.exports = {
  PROVIDERS,
  getProviderOrder,
  getProvider,
  isProviderConfigured,
  getProviderModelName,
  summarizeProviderError,
  parseJsonLoose,
  complete,
  completeJson,
  streamCompletion
};
