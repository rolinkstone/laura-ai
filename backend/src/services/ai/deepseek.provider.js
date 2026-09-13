const { getApiKey, getModel, getMaxTokens } = require('../llmConfigService');

/**
 * Provider LLM DeepSeek (OpenAI-compatible API).
 * Endpoint: {DEEPSEEK_BASE_URL}/chat/completions — format sama dengan OpenAI.
 * Model: deepseek-chat, deepseek-reasoner.
 * Konfigurasi (key & model) dibaca dari pengaturan runtime (dashboard) dengan fallback .env.
 */
const name = 'deepseek';

const getBaseUrl = () =>
  (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');

const getModelName = () => getModel('deepseek') || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const getApiKeyValue = () => getApiKey('deepseek') || process.env.DEEPSEEK_API_KEY || null;

/**
 * Kirim prompt ke DeepSeek.
 * @param {{system: string, user: string}} param
 * @returns {Promise<{text: string, model: string, tokensUsed: number}>}
 */
const chat = async ({ system, user }) => {
  const apiKey = getApiKeyValue();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getModelName(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.3,
      max_tokens: getMaxTokens(),
      stream: false
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('DeepSeek mengembalikan jawaban kosong');

  return {
    text,
    model: getModelName(),
    tokensUsed: data.usage?.total_tokens || 0
  };
};

/**
 * Streaming: kirim prompt ke DeepSeek dan hasilkan token satu per satu.
 * (DeepSeek memakai format SSE sama seperti OpenAI: data: {..} dan [DONE])
 * @param {{system: string, user: string}} param
 * @returns {AsyncGenerator<string>}
 */
async function* streamTokens({ system, user }) {
  const apiKey = getApiKeyValue();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
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
    throw new Error(`DeepSeek API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('Streaming tidak didukung oleh server DeepSeek');

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
