/**
 * Benchmark latensi LLM: model gratis Zen vs Gemini.
 * Ukur total waktu + panjang reasoning vs konten jawaban.
 * Jalankan: node src/scripts/benchModels.js
 */
require('dotenv').config();

const ZEN = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_KEY = process.env.OPENCODE_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const PROMPT = 'Jelaskan apa itu BPOM dan tugasnya dalam 2 kalimat.';

async function timeZen(model) {
  const t0 = Date.now();
  try {
    const res = await fetch(ZEN, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENCODE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PROMPT }],
        max_tokens: 512
      })
    });
    const dt = Date.now() - t0;
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    const content = msg.content || '';
    const reasoning = msg.reasoning_content || '';
    const usage = data.usage || {};
    return {
      model,
      status: res.status,
      ms: dt,
      contentLen: content.length,
      reasoningLen: reasoning.length,
      reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0
    };
  } catch (e) {
    return { model, status: 'ERR', ms: Date.now() - t0, err: e.message };
  }
}

async function timeGeminiProvider() {
  const llmConfig = require('../services/llmConfigService');
  const geminiProvider = require('../services/ai/gemini.provider');
  await llmConfig.loadConfig();
  const t0 = Date.now();
  try {
    const r = await geminiProvider.chat({ system: 'Anda asisten singkat.', user: PROMPT });
    return {
      model: `${r.model} (key DB)`,
      status: 'OK',
      ms: Date.now() - t0,
      contentLen: (r.text || '').length
    };
  } catch (e) {
    return { model: 'gemini', status: 'ERR', ms: Date.now() - t0, err: e.message };
  }
}

(async () => {
  console.log('Model gratis Zen:');
  for (const m of ['x-preview-f-free', 'hy3-free', 'big-pickle', 'mimo-v2.5-free']) {
    const r = await timeZen(m);
    console.log(`  ${r.model}: status=${r.status} waktu=${r.ms}ms jawaban=${r.contentLen}chr reasoning=${r.reasoningLen}chr (${r.reasoningTokens} token)`);
  }
  console.log('Gemini (provider asli, key DB):');
  const g = await timeGeminiProvider();
  console.log(`  ${g.model}: status=${g.status} waktu=${g.ms}ms jawaban=${g.contentLen}chr`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
