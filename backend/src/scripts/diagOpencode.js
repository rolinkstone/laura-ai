/**
 * Tes API key OpenCode Zen (https://opencode.ai/zen/v1).
 * Tidak menampilkan API key.
 * Jalankan: node src/scripts/diagOpencode.js
 */
require('dotenv').config();

const API_KEY = process.env.OPENCODE_API_KEY;
const BASE = 'https://opencode.ai/zen/v1';

async function tryUrl(url, method, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    console.log(`\n[${res.status}] ${method} ${url}`);
    console.log('   body:', text.slice(0, 600));
  } catch (err) {
    console.log(`\n[ERR] ${method} ${url}`);
    console.log('   ', err.message);
  }
}

(async () => {
  console.log('Key set :', API_KEY ? '✓ ya' : '✗ belum');
  // 1. Daftar model (cek auth + model yang tersedia)
  await tryUrl(`${BASE}/models`, 'GET');
  // 2. Coba model berbayar (untuk memastikan error billing)
  await tryUrl(
    `${BASE}/chat/completions`,
    'POST',
    {
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Balas hanya dengan kata: OK' }],
      max_tokens: 10
    }
  );
  // 3. Coba model gratis (apakah bisa tanpa billing)
  await tryUrl(
    `${BASE}/chat/completions`,
    'POST',
    {
      model: 'hy3-free',
      messages: [{ role: 'user', content: 'Balas hanya dengan kata: OK' }],
      max_tokens: 10
    }
  );
  process.exit(0);
})();
