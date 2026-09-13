const { pool } = require('../config/db');
const llmConfig = require('../services/llmConfigService');
const webSearchConfig = require('../services/webSearchConfigService');
const {
  getScope,
  isOfficialUrl,
  DEFAULT_ALLOWED_DOMAINS
} = require('../services/ai/agent/officialSources');
const { config: agentConfig } = require('../services/ai/agent/config');
const { resolveProvider } = require('../services/ai/agent/webSearch.service');

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

/**
 * Ringkasan lingkup sumber web (dipakai GET & POST /admin/web-search-config).
 * Menggabungkan pengaturan dashboard + bawaan + .env agar admin melihat
 * daftar domain yang BENAR-BENAR berlaku saat ini.
 */
const buildWebSearchPayload = () => {
  const cfg = webSearchConfig.getConfig();
  const agent = agentConfig();
  const scope = getScope();
  const listEnv = (value) =>
    String(value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    // Dikelola dari dashboard
    domains: cfg.domains || [],
    indexUrls: cfg.indexUrls || [],
    strictScope: !!cfg.strictScope,
    // Domain otomatis dari daftar Sumber (menu Sumber) + status pemakaiannya
    useSources: cfg.useSources !== false,
    registeredDomains: cfg.registeredDomains || [],
    // Nilai efektif (yang sedang dipakai pipeline)
    allowGovSuffix: scope.suffixes.includes('.go.id'),
    officialOnly: agent.web.officialOnly,
    // Asal nilai: 'dashboard' (diatur admin) atau 'env' (mengikuti .env)
    source: {
      allowGovSuffix: cfg.allowGovSuffix === null ? 'env' : 'dashboard',
      officialOnly: cfg.officialOnly === null ? 'env' : 'dashboard'
    },
    // Informasi pendukung untuk UI
    defaultDomains: DEFAULT_ALLOWED_DOMAINS,
    envDomains: listEnv(process.env.WEB_SEARCH_ALLOWED_DOMAINS),
    envIndexUrls: listEnv(process.env.WEB_SEARCH_INDEX_URLS),
    effective: scope, // { domains, suffixes, searchDomains }
    provider: resolveProvider(),
    webSearchEnabled: agent.web.enabled,
    resultsPerQuery: agent.web.results,
    fetchTop: agent.web.fetchTop
  };
};

/**
 * GET /api/admin/web-search-config
 * Daftar link/domain terpercaya yang boleh dipakai saat mencari di web.
 */
const getWebSearchConfig = async (req, res, next) => {
  try {
    res.json({ success: true, data: buildWebSearchPayload() });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/web-search-config
 * Simpan daftar link terpercaya. Berlaku LANGSUNG tanpa restart backend.
 * Body: { domains?: string[], indexUrls?: string[], allowGovSuffix?: boolean,
 *         officialOnly?: boolean, strictScope?: boolean, reset?: boolean }
 */
const updateWebSearchConfig = async (req, res, next) => {
  try {
    await webSearchConfig.updateConfig(req.body || {});
    res.json({
      success: true,
      message: 'Link terpercaya disimpan & langsung berlaku (tanpa restart).',
      data: buildWebSearchPayload()
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/web-search-config/check
 * Uji sebuah URL: apakah termasuk lingkup yang boleh dipakai?
 * Body: { url }
 */
const checkWebSearchUrl = async (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim();
    const allowed = isOfficialUrl(url);
    res.json({
      success: true,
      data: {
        url,
        allowed,
        reason: allowed
          ? 'termasuk lingkup (diizinkan)'
          : 'di luar lingkup — tambahkan domainnya ke daftar link terpercaya',
        scope: getScope()
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getConfig,
  getLlmConfig,
  updateLlmConfig,
  getWebSearchConfig,
  updateWebSearchConfig,
  checkWebSearchUrl
};
