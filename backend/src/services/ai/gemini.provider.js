/**
 * Provider LLM Google Gemini (Generative Language API).
 * Menggunakan fetch bawaan Node.js (>= 18) — tanpa SDK tambahan.
 */
const { getApiKey, getModel, getMaxTokens } = require('../llmConfigService');

/**
 * Provider LLM Google Gemini (Generative Language API).
 * Konfigurasi (key & model) dibaca dari pengaturan runtime (dashboard) dengan fallback .env.
 */
const name = 'gemini';

const getModelName = () => getModel('gemini') || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const getApiKeyValue = () => getApiKey('gemini') || process.env.GEMINI_API_KEY || null;

/**
 * Kirim prompt ke Gemini.
 * @param {{system: string, user: string}} param
 * @returns {Promise<{text: string, model: string, tokensUsed: number}>}
 */
const chat = async ({ system, user }) => {
  const apiKey = getApiKeyValue();
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModelName()}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${system}\n\nPertanyaan pengguna:\n${user}` }] }
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: getMaxTokens() }
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('Gemini mengembalikan jawaban kosong');

  return {
    text,
    model: getModelName(),
    tokensUsed: data.usageMetadata?.totalTokenCount || 0
  };
};

/**
 * Streaming: kirim prompt ke Gemini dan hasilkan token satu per satu.
 * @param {{system: string, user: string}} param
 * @returns {AsyncGenerator<string>}
 */
async function* streamTokens({ system, user }) {
  const apiKey = getApiKeyValue();
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi (di dashboard AI atau .env)');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModelName()}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\nPertanyaan pengguna:\n${user}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: getMaxTokens() }
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('Streaming tidak didukung oleh server Gemini');

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
      try {
        const json = JSON.parse(trimmed.slice(5).trim());
        const token = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        if (token) yield token;
      } catch {
        // abaikan baris yang tidak valid
      }
    }
  }
}

module.exports = { name, chat, streamTokens };
