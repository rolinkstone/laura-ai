/**
 * Provider LLM OpenAI (Chat Completions API).
 * Menggunakan fetch bawaan Node.js (>= 18) — tanpa SDK tambahan.
 */
const { getApiKey, getModel, getMaxTokens } = require('../llmConfigService');

/**
 * Provider LLM OpenAI (Chat Completions API).
 * Konfigurasi (key & model) dibaca dari pengaturan runtime (dashboard) dengan fallback .env.
 */
const name = 'openai';

const getModelName = () => getModel('openai') || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const getApiKeyValue = () => getApiKey('openai') || process.env.OPENAI_API_KEY || null;

// Base URL bisa diarahkan ke server OpenAI-compatible lokal (mis. Ollama di
// http://localhost:11434/v1) via env OPENAI_BASE_URL — tanpa perlu API key.
const getBaseUrl = () =>
  (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

/**
 * Kirim prompt ke OpenAI.
 * @param {{system: string, user: string}} param
 * @returns {Promise<{text: string, model: string, tokensUsed: number}>}
 */
const chat = async ({ system, user }) => {
  const apiKey = getApiKeyValue();
  // Ollama/lokal (OPENAI_BASE_URL) tidak butuh API key
  if (!apiKey && !process.env.OPENAI_BASE_URL) {
    throw new Error('OPENAI_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: getModelName(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.3,
      max_tokens: getMaxTokens()
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenAI mengembalikan jawaban kosong');

  return {
    text,
    model: getModelName(),
    tokensUsed: data.usage?.total_tokens || 0
  };
};

/**
 * Streaming: kirim prompt ke OpenAI dan hasilkan token satu per satu.
 * @param {{system: string, user: string}} param
 * @returns {AsyncGenerator<string>}
 */
async function* streamTokens({ system, user }) {
  const apiKey = getApiKeyValue();
  // Ollama/lokal (OPENAI_BASE_URL) tidak butuh API key
  if (!apiKey && !process.env.OPENAI_BASE_URL) {
    throw new Error('OPENAI_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: getModelName(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.3,
      max_tokens: getMaxTokens(),
      stream: true
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('Streaming tidak didukung oleh server OpenAI');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const token = json.choices?.[0]?.delta?.content || '';
        if (token) yield token;
      } catch {
        // abaikan baris yang tidak valid
      }
    }
  }
}

module.exports = { name, chat, streamTokens };
