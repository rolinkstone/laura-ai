/**
 * Cek koneksi & kemampuan PostgreSQL yang tersedia.
 * Jalankan: node src/scripts/checkPostgres.js
 */
require('dotenv').config();
const { pool } = require('../config/db');

const run = async () => {
  try {
    const [ver] = await pool.query('SELECT version() AS v');
    console.log('Versi PostgreSQL:', ver[0].v);

    // Cek ekstensi pgvector (opsional untuk semantic search native)
    const [vec] = await pool.query(
      "SELECT 1 AS ok FROM pg_extension WHERE extname = 'vector'"
    );
    console.log('──────────────────────────────────────');
    console.log('pgvector          :', vec.length ? '✅ terpasang' : '❌ belum (opsional)');
    console.log('\n👉 Embedding saat ini disimpan sebagai JSONB + cosine similarity di Node.js.');
    console.log('   Jika ingin vector search native, pasang pgvector lalu ubah kolom embedding ke tipe VECTOR.');
  } catch (err) {
    console.error('❌ Gagal terhubung ke PostgreSQL:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
