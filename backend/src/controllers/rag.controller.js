const { searchChunks } = require('../services/vectorSearchService');

/**
 * POST /api/rag/search
 * Vector search: embed pertanyaan → cari chunk paling relevan
 * Body: { query, limit?, category_id? }
 */
const search = async (req, res, next) => {
  try {
    const { query, limit, category_id } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Query pencarian wajib diisi' });
    }

    const startedAt = Date.now();
    const results = await searchChunks(query.trim(), {
      limit: limit ? Number(limit) : Number(process.env.SEARCH_RESULT_LIMIT) || 5,
      categoryId: category_id || null
    });

    res.json({
      success: true,
      data: {
        query: query.trim(),
        count: results.length,
        duration_ms: Date.now() - startedAt,
        results
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { search };
