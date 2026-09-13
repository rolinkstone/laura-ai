/**
 * Evaluasi RAG — mengukur kualitas retrieval & performa.
 *
 * Metrik yang dihitung:
 *  - Hit rate@K : seberapa sering dokumen yang diharapkan muncul di top-K
 *  - Keyword hit: seberapa sering konten hasil mengandung kata kunci yang diharapkan
 *  - Waktu respons rata-rata & p95
 *  - No-source rate: pertanyaan tanpa hasil retrieval
 *
 * Catatan: Hallucination & source accuracy memerlukan LLM + penilai (judge),
 * dijalankan terpisah setelah AI_PROVIDER dikonfigurasi (lihat eval/README).
 *
 * Jalankan: node src/scripts/evalRag.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { searchChunks } = require('../services/vectorSearchService');

const EVAL_DIR = path.join(__dirname, '..', '..', 'eval');
const QUESTIONS_FILE = path.join(EVAL_DIR, 'questions.json');
const REPORT_FILE = path.join(EVAL_DIR, 'report.json');
const REPORT_MD = path.join(EVAL_DIR, 'report.md');

const TOP_K = 5;

const percentile = (arr, p) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
};

const run = async () => {
  try {
    const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
    console.log(`📋 Evaluasi ${questions.length} pertanyaan (top-${TOP_K})...\n`);

    const results = [];
    const times = [];

    for (const q of questions) {
      const startedAt = Date.now();
      const hits = await searchChunks(q.question, { limit: TOP_K });
      const elapsed = Date.now() - startedAt;
      times.push(elapsed);

      // Hit rate berdasarkan judul dokumen yang diharapkan
      const titleHit = q.expected_title
        ? hits.some((h) => (h.document_title || '').toLowerCase().includes(q.expected_title.toLowerCase()))
        : null;

      // Keyword hit pada konten hasil
      const kw = q.keywords || [];
      const keywordHit =
        kw.length > 0
          ? kw.every((k) => hits.some((h) => (h.content || '').toLowerCase().includes(k.toLowerCase())))
          : null;

      results.push({
        question: q.question,
        expected_title: q.expected_title || null,
        title_hit: titleHit,
        keyword_hit: keywordHit,
        top_title: hits[0]?.document_title || null,
        top_score: hits[0]?.score ?? null,
        count: hits.length,
        time_ms: elapsed
      });

      const flag = titleHit === true ? '✓' : titleHit === false ? '✗' : keywordHit === true ? '~' : '?';
      console.log(`${flag} [${String(elapsed).padStart(4)}ms] ${q.question} → ${hits[0]?.document_title || '(kosong)'}`);
    }

    // Agregasi
    const withTitle = results.filter((r) => r.expected_title !== null);
    const titleHits = withTitle.filter((r) => r.title_hit === true).length;
    const keywordQ = results.filter((r) => r.keyword_hit !== null);
    const keywordHits = keywordQ.filter((r) => r.keyword_hit === true).length;
    const noSource = results.filter((r) => r.count === 0).length;

    const summary = {
      total_questions: results.length,
      top_k: TOP_K,
      avg_time_ms: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      p95_time_ms: Math.round(percentile(times, 95)),
      hit_rate_title: withTitle.length ? Number((titleHits / withTitle.length).toFixed(4)) : null,
      hit_rate_keyword: keywordQ.length ? Number((keywordHits / keywordQ.length).toFixed(4)) : null,
      no_source_rate: Number((noSource / results.length).toFixed(4)),
      evaluated_at: new Date().toISOString(),
      note: 'Hallucination & source accuracy memerlukan LLM terkonfigurasi + penilai.'
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify({ summary, results }, null, 2));

    // Laporan markdown
    const md = [
      '# Evaluasi RAG',
      '',
      `Dibuat: ${summary.evaluated_at}`,
      '',
      '## Ringkasan',
      '',
      '| Metrik | Nilai |',
      '| --- | --- |',
      `| Pertanyaan | ${summary.total_questions} |`,
      `| Waktu respons rata-rata | ${summary.avg_time_ms} ms |`,
      `| Waktu respons p95 | ${summary.p95_time_ms} ms |`,
      `| Hit rate (judul) @${summary.top_k} | ${summary.hit_rate_title ?? '-'} |`,
      `| Hit rate (kata kunci) @${summary.top_k} | ${summary.hit_rate_keyword ?? '-'} |`,
      `| No-source rate | ${summary.no_source_rate} |`,
      '',
      '## Detail',
      '',
      '| # | Pertanyaan | Judul diharapkan | Hit judul | Hit kata kunci | Waktu | Top hasil |',
      '| --- | --- | --- | --- | --- | --- | --- |'
    ];
    results.forEach((r, i) => {
      md.push(
        `| ${i + 1} | ${r.question} | ${r.expected_title || '-'} | ${r.title_hit === null ? '-' : r.title_hit ? '✓' : '✗'} | ${r.keyword_hit === null ? '-' : r.keyword_hit ? '✓' : '✗'} | ${r.time_ms} ms | ${r.top_title || '(kosong)'} |`
      );
    });

    fs.writeFileSync(REPORT_MD, md.join('\n'));

    console.log('\n════════════════════════════════════════');
    console.log('📊 RINGKASAN');
    console.log('────────────────────────────────────────');
    console.log(`Total pertanyaan        : ${summary.total_questions}`);
    console.log(`Waktu rata-rata         : ${summary.avg_time_ms} ms`);
    console.log(`Waktu p95               : ${summary.p95_time_ms} ms`);
    console.log(`Hit rate (judul)@${TOP_K}     : ${summary.hit_rate_title ?? '-'}`);
    console.log(`Hit rate (kata kunci)@${TOP_K} : ${summary.hit_rate_keyword ?? '-'}`);
    console.log(`No-source rate          : ${summary.no_source_rate}`);
    console.log('────────────────────────────────────────');
    console.log(`Laporan: ${REPORT_MD}`);
    console.log(`Data   : ${REPORT_FILE}`);
  } catch (err) {
    console.error('❌ Gagal evaluasi:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
