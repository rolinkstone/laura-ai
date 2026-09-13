/**
 * Uji cepat endpoint streaming SSE (public & auth).
 * Jalankan: node src/scripts/testStream.js [public|auth]
 */
require('dotenv').config();

const API = `http://localhost:${process.env.PORT || 5005}/api`;

const testPublic = async () => {
  console.log('=== PUBLIC STREAM /api/public/chat/stream ===');
  const res = await fetch(`${API}/public/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Bagaimana cara melakukan pengaduan?', limit: 2 })
  });
  console.log('HTTP', res.status, res.headers.get('content-type'));

  if (!res.body) {
    console.log('❌ Tidak ada body');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let sources = null;
  let tokens = 0;
  let done = null;

  while (true) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const evt = JSON.parse(line.slice(5));
        if (evt.type === 'sources') { sources = evt.sources; console.log(`  📎 sources: ${evt.sources.length} chunk`); }
        else if (evt.type === 'token') { tokens += 1; }
        else if (evt.type === 'done') { done = evt; }
        else if (evt.type === 'error') { console.log('  ❌ error:', evt.message); }
      }
    }
  }

  console.log(`  ✅ tokens diterima: ${tokens} | done.model: ${done ? done.model : 'N/A'} | session_id: ${done ? done.session_id : 'N/A'}`);
  if (sources) {
    console.log('  Sumber teratas:', sources[0]?.title, 'hal', sources[0]?.page, 'score', sources[0]?.score);
  }
};

const testAuth = async () => {
  console.log('=== AUTH STREAM /api/chat/stream ===');
  let token = process.env.TEST_TOKEN;
  if (!token) {
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.TEST_USERNAME || 'admin',
        password: process.env.TEST_PASSWORD || ''
      })
    });
    ({ token } = await login.json());
  }
  if (!token) {
    console.log('❌ Tidak ada token. Set TEST_TOKEN di .env (lihat DEPLOY.md).');
    return;
  }

  const res = await fetch(`${API}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question: 'Apakah layanan pengaduan berbayar?', limit: 2 })
  });
  console.log('HTTP', res.status, res.headers.get('content-type'));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let sources = null;
  let tokens = 0;
  let done = null;

  while (true) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const evt = JSON.parse(line.slice(5));
        if (evt.type === 'sources') { sources = evt.sources; console.log(`  📎 sources: ${evt.sources.length} chunk`); }
        else if (evt.type === 'token') tokens += 1;
        else if (evt.type === 'done') done = evt;
        else if (evt.type === 'error') console.log('  ❌ error:', evt.message);
      }
    }
  }
  console.log(`  ✅ tokens: ${tokens} | model: ${done ? done.model : 'N/A'} | session_id: ${done ? done.session_id : 'N/A'}`);
};

const which = process.argv[2] || 'public';
const runner = which === 'auth' ? testAuth : testPublic;
runner().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
