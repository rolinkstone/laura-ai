/**
 * Tes mimo-v2.5-free dengan prompt panjang mirip RAG (system + context).
 * Jalankan: node src/scripts/testMimoRag.js
 */
require('dotenv').config();
const provider = require('../services/ai/opencode.provider');

(async () => {
  const system =
    'Anda adalah asisten LAURA. Gunakan HANYA informasi dari sumber di bawah untuk menjawab. ' +
    Array(15)
      .fill('SUMBER: BPOM mengawasi obat dan makanan, menerbitkan izin edar, dan melakukan pengawasan produk beredar.')
      .join('\n');
  const user = 'Apa itu BPOM dan bagaimana cara mendaftarkan produk?';

  const t0 = Date.now();
  try {
    const r = await provider.chat({ system, user });
    console.log(`OK model=${r.model} waktu=${Date.now() - t0}ms jawaban=${r.text.length}chr`);
    console.log(r.text.slice(0, 200));
  } catch (e) {
    console.log(`ERR waktu=${Date.now() - t0}ms`);
    console.log(e.message.slice(0, 400));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
