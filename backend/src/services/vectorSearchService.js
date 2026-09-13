const { pool } = require('../config/db');
const { embed } = require('./embeddingService');

/**
 * Cosine similarity antara dua vektor.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} -1 .. 1
 */
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

const normalizeVector = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Vector search: embed pertanyaan → cari chunk paling relevan.
 * Embedding disimpan sebagai JSONB; cosine similarity dihitung di Node.js
 * (tanpa ekstensi pgvector).
 *
 * @param {string} query teks pertanyaan
 * @param {{limit?: number, categoryId?: number|null}} options
 * @returns {Promise<Array>} chunk relevan (tanpa vektor besar)
 */
const searchChunks = async (query, options = {}) => {
  const limit = Math.min(Number(options.limit) || 5, 20);
  const categoryId = options.categoryId || null;

  const queryVec = await embed(`query: ${query}`);

  let sql = `
    SELECT dc.id, dc.document_id, dc.chunk_index, dc.content,
           dc.page_number, dc.section, dc.embedding,
           d.title AS document_title, d.category_id
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.status = 'ready' AND d.is_active = 1 AND dc.embedding IS NOT NULL
  `;
  const params = [];
  if (categoryId) {
    sql += ' AND d.category_id = ?';
    params.push(categoryId);
  }

  const [rows] = await pool.query(sql, params);

  const minScore = Number(process.env.SEARCH_MIN_SCORE) || 0.15;

  const results = rows
    .map((r) => {
      const vec = normalizeVector(r.embedding);
      return { ...r, score: vec ? cosineSimilarity(queryVec, vec) : 0 };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Jangan kembalikan vektor embedding (terlalu besar) — hanya metadata
  return results.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    document_title: r.document_title,
    category_id: r.category_id,
    chunk_index: r.chunk_index,
    page_number: r.page_number,
    section: r.section,
    content: r.content,
    score: Number(r.score.toFixed(4))
  }));
};

module.exports = { searchChunks, cosineSimilarity };
