/**
 * Provider LLM 9Router (OpenAI-compatible Chat Completions — SSE streaming).
 *
 * 9Router (http://localhost:20128) adalah AI gateway yang merutekan ke banyak
 * provider/model dengan SATU API key (dari dashboard 9Router).
 *
 * Catatan penting:
 *  - Endpoint `/v1/chat/completions` SELALU merespons dalam format SSE
 *    (streaming), bahkan tanpa `stream: true`. Mengirim `stream: false`
 *    justru mengembalikan 500.
 *  - Karena itu metode `chat` (non-streaming) juga membaca aliran SSE lalu
 *    menggabungkan token `delta.content`.
 *  - Model reasoning (mis. beberapa model Gemini) menghasilkan `reasoning_tokens`;
 *    metode streaming hanya mengambil `delta.content`, bukan reasoning.
 */
const { getApiKey, getModel, getMaxTokens, getBaseUrl: getConfiguredBaseUrl } = require('../llmConfigService');

const name = 'ninerouter';

const getModelName = () =>
  getModel('ninerouter') || process.env.NINEROUTER_MODEL || 'kr/auto';
const getApiKeyValue = () => getApiKey('ninerouter') || process.env.NINEROUTER_API_KEY || null;

// Base URL gateway 9Router (dari pengaturan runtime/dashboard, fallback env & default).
const getBaseUrl = () => getConfiguredBaseUrl('ninerouter').replace(/\/$/, '');

const buildBody = ({ system, user }, { stream }) => ({
  model: getModelName(),
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ],
  temperature: 0.3,
  max_tokens: getMaxTokens(),
  stream
});

/**
 * Kirim request ke 9Router dan kembalikan reader body-nya (selalu streaming SSE).
 */
const fetchStream = async ({ system, user }, { stream }) => {
  const apiKey = getApiKeyValue();
  if (!apiKey) {
    throw new Error('NINEROUTER_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildBody({ system, user }, { stream }))
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`9Router API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('Streaming tidak didukung oleh server 9Router');
  return res.body.getReader();
};

/**
 * Kirim prompt ke 9Router (non-streaming) — membaca SSE dan menggabungkan token.
 * @param {{system: string, user: string}} param
 * @returns {Promise<{text: string, model: string, tokensUsed: number}>}
 */
const chat = async ({ system, user }) => {
  const reader = await fetchStream({ system, user }, { stream: true });
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let tokensUsed = 0;

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
        if (token) text += token;
        if (json.usage?.total_tokens) tokensUsed = json.usage.total_tokens;
      } catch {
        // abaikan baris yang tidak valid
      }
    }
  }

  if (!text) throw new Error('9Router mengembalikan jawaban kosong');

  return { text, model: getModelName(), tokensUsed };
};

/**
 * Streaming: kirim prompt ke 9Router dan hasilkan token satu per satu.
 * (Format SSE sama seperti OpenAI: `data: {..}` dan `[DONE]`)
 * @param {{system: string, user: string}} param
 * @returns {AsyncGenerator<string>}
 */
async function* streamTokens({ system, user }) {
  const reader = await fetchStream({ system, user }, { stream: true });
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
