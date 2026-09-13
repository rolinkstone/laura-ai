/**
 * Provider LLM OpenCode (OpenAI-compatible Chat Completions API).
 * Menggunakan fetch bawaan Node.js (>= 18) — tanpa SDK tambahan.
 */
const { getApiKey, getModel, getMaxTokens } = require('../llmConfigService');

/**
 * Provider LLM OpenCode (OpenAI-compatible).
 * Konfigurasi (key & model) dibaca dari pengaturan runtime (dashboard) dengan fallback .env.
 */
const name = 'opencode';

const getModelName = () =>
  getModel('opencode') || process.env.OPENCODE_MODEL || 'mimo-v2.5-free';
const getApiKeyValue = () => getApiKey('opencode') || process.env.OPENCODE_API_KEY || null;

// Base URL bisa diarahkan ke server OpenAI-compatible (mis. gateway lokal)
// via env OPENCODE_BASE_URL.
const getBaseUrl = () =>
  (process.env.OPENCODE_BASE_URL || 'https://api.opencode.ai/v1').replace(/\/$/, '');

/**
 * Kirim prompt ke OpenCode.
 * @param {{system: string, user: string}} param
 * @returns {Promise<{text: string, model: string, tokensUsed: number}>}
 */
const chat = async ({ system, user }) => {
  const apiKey = getApiKeyValue();
  if (!apiKey) {
    throw new Error('OPENCODE_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');
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
    throw new Error(`OpenCode API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenCode mengembalikan jawaban kosong');

  return {
    text,
    model: getModelName(),
    tokensUsed: data.usage?.total_tokens || 0
  };
};

/**
 * Streaming: kirim prompt ke OpenCode dan hasilkan token satu per satu.
 * (OpenCode memakai format SSE sama seperti OpenAI: data: {..} dan [DONE])
 * @param {{system: string, user: string}} param
 * @returns {AsyncGenerator<string>}
 */
async function* streamTokens({ system, user }) {
  const apiKey = getApiKeyValue();
  if (!apiKey) {
    throw new Error('OPENCODE_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');
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
    throw new Error(`OpenCode API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('Streaming tidak didukung oleh server OpenCode');

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
