/**
 * Diagnosa: model mana di gateway yang saat ini BERHASIL dipakai?
 * Menguji satu model dasar per penyedia (prefix) dengan prompt sangat pendek.
 *
 * Jalankan: node src/scripts/diagFindWorkingModel.js
 */

require('dotenv').config();
const llmConfig = require('../services/llmConfigService');

(async () => {
  await llmConfig.loadConfig();

  const baseUrl = llmConfig.getBaseUrl('ninerouter').replace(/\/$/, '');
  const apiKey = llmConfig.getApiKey('ninerouter');

  const res = await fetch(`${baseUrl}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  });
  const json = await res.json().catch(() => ({}));
  const ids = (json.data || json.models || []).map((m) => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);

  const byPrefix = new Map();
  for (const id of ids) {
    const prefix = id.includes('/') ? id.split('/')[0] : '(tanpa-prefix)';
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(id);
  }

  console.log(`Total model: ${ids.length}`);
  console.log('Penyedia (prefix):', [...byPrefix.keys()].map((p) => `${p} (${byPrefix.get(p).length})`).join(', '));

  const candidates = [];
  for (const [prefix, list] of byPrefix) {
    const simple = list.find((x) => !/thinking|agentic/.test(x)) || list[0];
    candidates.push({ prefix, model: simple });
  }

  console.log(`\nMenguji ${candidates.length} model (1 varian dasar per penyedia)...\n`);
  const provider = require('../services/ai/ninerouter.provider');
  const working = [];

  for (const c of candidates) {
    const startedAt = Date.now();
    try {
      const out = await provider.chat({
        system: 'Balas satu kata saja.',
        user: 'ping',
        maxTokens: 8,
        temperature: 0,
        timeoutMs: 25000,
        model: c.model
      });
      working.push(c.model);
      console.log(`OK    ${c.model.padEnd(34)} ${String(Date.now() - startedAt).padStart(6)} ms  → "${String(out.text).slice(0, 30)}"`);
    } catch (err) {
      const msg = String(err.message).replace(/\s+/g, ' ').replace(/^9Router API error /, 'HTTP ');
      console.log(`GAGAL ${c.model.padEnd(34)} ${msg.slice(0, 105)}`);
    }
  }

  console.log(`\nModel yang BERHASIL: ${working.length ? working.join(', ') : '(tidak ada)'}`);
})();
