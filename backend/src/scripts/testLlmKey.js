/**
 * Uji hapus/restore API key via endpoint admin (tanpa mengetik secret di terminal).
 * Jalankan: node src/scripts/testLlmKey.js
 */
require('dotenv').config();
const API = `http://localhost:${process.env.PORT || 5005}/api`;

(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const { token } = await login.json();
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const getConfig = async () =>
    (await (await fetch(`${API}/admin/llm-config`, { headers: h })).json()).data;

  let cfg = await getConfig();
  console.log('1. Awal        : deepseek configured =', cfg.configured.deepseek);

  // Hapus key deepseek ('' = nonaktifkan)
  await fetch(`${API}/admin/llm-config`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ deepseek_api_key: '' })
  });
  cfg = await getConfig();
  console.log('2. Setelah hapus: deepseek configured =', cfg.configured.deepseek);

  // Chat → harus fallback ke provider berikutnya (gemini)
  const c = await (
    await fetch(`${API}/public/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Apa itu BPOM?' })
    })
  ).json();
  console.log('3. Chat setelah hapus: model =', c.data.model);

  // Restore key dari .env
  const key = process.env.DEEPSEEK_API_KEY;
  if (key) {
    await fetch(`${API}/admin/llm-config`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ deepseek_api_key: key })
    });
    cfg = await getConfig();
    console.log('4. Setelah restore: deepseek configured =', cfg.configured.deepseek);
  }
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
