/**
 * Diagnosa: daftar model yang tersedia di gateway 9Router yang dipakai backend.
 *
 * Jalankan: node src/scripts/diagGatewayModels.js
 */

require('dotenv').config();
const llmConfig = require('../services/llmConfigService');

(async () => {
  await llmConfig.loadConfig();

  const baseUrl = llmConfig.getBaseUrl('ninerouter').replace(/\/$/, '');
  const apiKey = llmConfig.getApiKey('ninerouter');
  const model = llmConfig.getModel('ninerouter');

  console.log(`Gateway : ${baseUrl}`);
  console.log(`API key : ${apiKey ? '(terisi)' : '(KOSONG)'}`);
  console.log(`Model terpasang: ${model}\n`);

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    });
    console.log(`GET /models -> HTTP ${res.status} ${res.statusText}`);

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      console.log('Respons bukan JSON:', text.slice(0, 300));
      return;
    }

    if (json.error) {
      console.log('Error dari gateway:', JSON.stringify(json.error).slice(0, 300));
    }

    const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
    console.log(`Jumlah model terdaftar: ${list.length}`);

    const ids = list.map((m) => m.id || m.name || String(m));
    console.log('\nContoh model yang tersedia (20 pertama):');
    ids.slice(0, 20).forEach((id) => console.log(`  - ${id}`));

    const relevant = ids.filter((id) => /seed|gemini|kr\/|gpt|claude|deepseek|kimi/i.test(id));
    console.log('\nYang mirip dengan model yang Anda pakai / umum:');
    relevant.slice(0, 25).forEach((id) => console.log(`  - ${id}`));

    const wanted = ids.find((id) => id === model);
    console.log(`\nModel terpasang "${model}" ada di daftar? ${wanted ? 'YA' : 'TIDAK'}`);
    if (!ids.some((id) => id === model)) {
      console.log('→ Karena tidak terdaftar, gateway menolak (model_not_found / no active credentials).');
    }
  } catch (err) {
    console.log('GAGAL menghubungi gateway:', err.message);
  }
})();
