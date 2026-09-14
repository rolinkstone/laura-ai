/**
 * Diagnosa: apakah dokumen yang di-upload di dashboard SIAP dipakai RAG?
 * (RAG hanya memakai dokumen dengan status 'ready' DAN is_active = 1.)
 *
 * Jalankan: node src/scripts/diagDocuments.js
 */

require('dotenv').config();
const { pool } = require('../config/db');

(async () => {
  const [docs] = await pool.query(
    `SELECT d.id, d.title, d.status, d.is_active,
            (SELECT COUNT(*)::int FROM document_chunks c WHERE c.document_id = d.id) AS chunks,
            (SELECT COUNT(*)::int FROM document_chunks c WHERE c.document_id = d.id AND c.embedding IS NOT NULL) AS embedded,
            d.created_at
       FROM documents d
      ORDER BY d.id DESC`
  );

  console.log('=== Dokumen di dashboard ===');
  docs.forEach((d) => {
    const usable = d.status === 'ready' && d.is_active === 1 && d.embedded > 0;
    console.log(
      `${usable ? '✅ DIPAKAI' : '⚠️  TIDAK'} | #${d.id} "${String(d.title).slice(0, 40)}" | status=${d.status} | aktif=${d.is_active} | chunk=${d.chunks} (embedding=${d.embedded})`
    );
  });

  const [faq] = await pool.query('SELECT COUNT(*)::int AS c FROM faq WHERE is_active = 1').catch(() => [[{ c: 0 }]]);
  console.log(`\nFAQ aktif: ${faq[0].c}`);

  const [drafts] = await pool.query("SELECT COUNT(*)::int AS c FROM documents WHERE status <> 'ready' OR is_active = 0");
  if (drafts[0].c > 0) {
    console.log(`\n⚠️  Ada ${drafts[0].c} dokumen yang TIDAK dipakai RAG (status bukan 'ready' atau nonaktif).`);
    console.log("   → Buka dashboard → Dokumen → aktifkan / tunggu proses 'ready' (atau klik Re-process / Re-embedding).");
  }

  await pool.end();
})();
