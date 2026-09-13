const { pool } = require('../config/db');
const llmConfig = require('../services/llmConfigService');

/**
 * GET /api/admin/stats
 * Ringkasan statistik untuk dashboard (khusus admin).
 */
const getStats = async (req, res, next) => {
  try {
    const tables = [
      ['documents', 'documents'],
      ['faqs', 'faq'],
      ['categories', 'document_categories'],
      ['sources', 'sources'],
      ['users', 'users'],
      ['sessions', 'chat_sessions'],
      ['messages', 'chat_messages'],
      ['feedback', 'feedback'],
      ['aiLogs', 'ai_logs']
    ];

    const counts = {};
    for (const [key, table] of tables) {
      const [r] = await pool.query(`SELECT COUNT(*) AS c FROM ${table}`);
      counts[key] = r[0].c;
    }

    const [activeDocuments] = await pool.query(
      "SELECT COUNT(*) AS c FROM documents WHERE status = 'ready' AND is_active = 1"
    );
    counts.activeDocuments = activeDocuments[0].c;

    const [recentLogs] = await pool.query(
      `SELECT id, model, prompt, duration_ms, status, created_at
       FROM ai_logs ORDER BY id DESC LIMIT 10`
    );

    const [recentSessions] = await pool.query(
      `SELECT cs.id, cs.title, cs.created_at, u.full_name AS user_name,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) AS message_count
       FROM chat_sessions cs
       LEFT JOIN users u ON cs.user_id = u.id
       ORDER BY cs.updated_at DESC LIMIT 8`
    );

    res.json({ success: true, data: { counts, recentLogs, recentSessions } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/config
 * Konfigurasi AI (tanpa membocorkan API key).
 */
const getConfig = async (req, res, next) => {
  try {
    const llm = llmConfig.getPublicConfig();
    res.json({
      success: true,
      data: {
        ...llm,
        embedding_model: process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small',
        search_min_score: Number(process.env.SEARCH_MIN_SCORE) || 0.15,
        search_result_limit: Number(process.env.SEARCH_RESULT_LIMIT) || 5,
        node_env: process.env.NODE_ENV || 'development'
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/llm-config
 * Konfigurasi LLM saat ini (tanpa API key — hanya status terkonfigurasi).
 */
const getLlmConfig = async (req, res, next) => {
  try {
    res.json({ success: true, data: llmConfig.getPublicConfig() });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/llm-config
 * Ubah konfigurasi LLM (key, model, urutan provider, aktif/nonaktif).
 * Berlaku langsung tanpa restart.
 *
 * Konvensi API key: field tidak dikirim = jangan ubah; '' = hapus; non-empty = simpan.
 */
const updateLlmConfig = async (req, res, next) => {
  try {
    const config = await llmConfig.updateConfig(req.body);
    res.json({
      success: true,
      message: 'Pengaturan LLM berhasil disimpan',
      data: config
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, getConfig, getLlmConfig, updateLlmConfig };
