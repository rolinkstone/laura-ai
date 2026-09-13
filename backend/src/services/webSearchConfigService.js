/**
 * Konfigurasi runtime SUMBER WEB TERPERCAYA (link/domain yang boleh dicari).
 *
 * Disimpan di tabel `settings` sehingga dapat diubah dari dashboard admin TANPA
 * restart backend. Nilai di-cache di memori dan disegarkan setiap kali
 * pengaturan disimpan (pola sama seperti `llmConfigService`).
 *
 * Bila belum pernah diatur dari dashboard → nilai dari .env yang dipakai:
 *   WEB_SEARCH_ALLOWED_DOMAINS, WEB_SEARCH_INDEX_URLS,
 *   WEB_SEARCH_ALLOW_GOID_SUFFIX, WEB_SEARCH_OFFICIAL_ONLY
 *
 * Catatan: modul ini SENGAJA tidak mengimpor `officialSources.js` agar tidak
 * terjadi circular require (officialSources → webSearchConfigService).
 */

const { getSetting, setSetting } = require('./settingsService');

const KEYS = {
  domains: 'web_search_allowed_domains',
  indexUrls: 'web_search_index_urls',
  allowGovSuffix: 'web_search_allow_goid_suffix',
  officialOnly: 'web_search_official_only',
  strictScope: 'web_search_strict_scope',
  useSources: 'web_search_use_sources'
};

const envBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return !/^(0|false|no|off|nonaktif)$/i.test(String(value).trim());
};

const splitList = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

let state = null;

const buildDefaults = () => ({
  domains: [], // daftar TAMBAHAN dari dashboard (domain yang boleh dicari)
  indexUrls: [], // halaman indeks untuk di-crawl (mode provider `internal`)
  allowGovSuffix: null, // null = ikut .env
  officialOnly: null, // null = ikut .env
  strictScope: false, // true = abaikan daftar bawaan, hanya pakai daftar ini
  useSources: true, // true = domain dari menu Sumber (tabel `sources`) ikut dipakai
  registeredDomains: [] // hasil turunan URL pada tabel `sources`
});

/**
 * Normalisasi domain: buang skema/path/port/`www.`, jadikan huruf kecil.
 * Contoh: `https://WWW.POM.go.id/regulasi` → `pom.go.id`
 * @param {string} raw
 * @returns {string|null} null bila tidak valid
 */
const normalizeDomain = (raw) => {
  let v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // buang skema
  v = v.split('/')[0].split('?')[0].split('#')[0];
  v = v.split('@').pop(); // buang user:pass@
  v = v.replace(/:\d+$/, ''); // buang port
  v = v.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return null;
  if (v.length > 253) return null;
  return v;
};

/**
 * Normalisasi URL halaman indeks (wajib http/https).
 * @param {string} raw
 * @returns {string|null} null bila tidak valid
 */
const normalizeUrl = (raw) => {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
};

// Ekstensi file yang bukan domain (mis. lampiran PDF pada kolom URL)
const FILE_EXT = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', 'txt', 'csv'
]);

/**
 * Domain dari daftar Sumber (tabel `sources`) — inilah "link yang diinput admin".
 * Dipakai sebagai ruang lingkup pencarian web begitu sumber ditambah/diubah.
 * URL boleh ditulis lengkap (https://...) atau tanpa skema (palangkaraya.pom.go.id).
 * @returns {Promise<string[]>}
 */
const loadRegisteredDomains = async () => {
  try {
    const { pool } = require('../config/db');
    const [rows] = await pool.query("SELECT url FROM sources WHERE url IS NOT NULL AND url <> ''");
    const domains = [];
    for (const row of rows) {
      const domain = normalizeDomain(row.url);
      if (!domain) continue;
      // Lewati entri yang sebenarnya nama file (lampiran.pdf, dokumen.docx, ...)
      if (FILE_EXT.has(domain.split('.').pop())) continue;
      domains.push(domain);
    }
    return [...new Set(domains)];
  } catch (err) {
    console.warn(`[webSearchConfig] gagal membaca tabel sources: ${err.message}`);
    return [];
  }
};

/**
 * Muat konfigurasi dari tabel `settings` (dipanggil saat start & setelah simpan).
 * @returns {Promise<object>}
 */
const loadConfig = async () => {
  state = buildDefaults();

  const [domains, indexUrls, allowGovSuffix, officialOnly, strictScope, useSources] = await Promise.all([
    getSetting(KEYS.domains),
    getSetting(KEYS.indexUrls),
    getSetting(KEYS.allowGovSuffix),
    getSetting(KEYS.officialOnly),
    getSetting(KEYS.strictScope),
    getSetting(KEYS.useSources)
  ]);

  if (domains !== null) state.domains = splitList(domains).map(normalizeDomain).filter(Boolean);
  if (indexUrls !== null) state.indexUrls = splitList(indexUrls).map(normalizeUrl).filter(Boolean);
  if (allowGovSuffix !== null) state.allowGovSuffix = envBool(allowGovSuffix, false);
  if (officialOnly !== null) state.officialOnly = envBool(officialOnly, true);
  if (strictScope !== null) state.strictScope = envBool(strictScope, false);
  if (useSources !== null) state.useSources = envBool(useSources, true);

  // Turunkan domain dari URL yang ada di menu Sumber
  state.registeredDomains = state.useSources ? await loadRegisteredDomains() : [];

  return state;
};

/** Muat ulang konfigurasi (dipakai setelah daftar Sumber berubah). @returns {Promise<object>} */
const refresh = () => loadConfig();

/**
 * Konfigurasi aktif (fallback ke default bila belum dimuat).
 * @returns {object}
 */
const getConfig = () => {
  if (!state) state = buildDefaults();
  return state;
};

/** Domain tambahan dari dashboard. @returns {string[]} */
const getExtraDomains = () => getConfig().domains || [];

/** Halaman indeks tambahan dari dashboard. @returns {string[]} */
const getExtraIndexUrls = () => getConfig().indexUrls || [];

/** Override izin `*.go.id` (null = ikut .env). @returns {boolean|null} */
const getAllowGovSuffix = () => getConfig().allowGovSuffix;

/** Override "hanya domain dalam lingkup" (null = ikut .env). @returns {boolean|null} */
const getOfficialOnly = () => getConfig().officialOnly;

/** true = abaikan daftar bawaan sistem. @returns {boolean} */
const isStrictScope = () => !!getConfig().strictScope;

/** true = domain dari menu Sumber ikut dipakai. @returns {boolean} */
const usesRegisteredSources = () => getConfig().useSources !== false;

/** Domain turunan dari daftar Sumber (tabel `sources`). @returns {string[]} */
const getRegisteredDomains = () => getConfig().registeredDomains || [];

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const assertArray = (value, label) => {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw badRequest(`${label} harus berupa array`);
  return value;
};

/**
 * Simpan pengaturan dari dashboard.
 *
 * @param {{domains?: string[], indexUrls?: string[], allowGovSuffix?: boolean,
 *          officialOnly?: boolean, strictScope?: boolean, reset?: boolean}} param
 * @returns {Promise<object>} konfigurasi terbaru
 */
const updateConfig = async ({
  domains,
  indexUrls,
  allowGovSuffix,
  officialOnly,
  strictScope,
  useSources,
  reset
} = {}) => {
  // reset = kembalikan seluruh nilai ke pengaturan .env (hapus dari tabel settings)
  if (reset) {
    await Promise.all(Object.values(KEYS).map((key) => setSetting(key, null)));
    await loadConfig();
    return getConfig();
  }

  const domainInput = assertArray(domains, 'domains');
  if (domainInput) {
    const invalid = domainInput.filter((d) => !normalizeDomain(d));
    if (invalid.length > 0) throw badRequest(`Domain tidak valid: ${invalid.join(', ')}`);
    await setSetting(KEYS.domains, [...new Set(domainInput.map(normalizeDomain))].join(','));
  }

  const urlInput = assertArray(indexUrls, 'indexUrls');
  if (urlInput) {
    const invalid = urlInput.filter((u) => !normalizeUrl(u));
    if (invalid.length > 0) throw badRequest(`URL tidak valid (harus http/https): ${invalid.join(', ')}`);
    await setSetting(KEYS.indexUrls, [...new Set(urlInput.map(normalizeUrl))].join(','));
  }

  if (allowGovSuffix !== undefined) await setSetting(KEYS.allowGovSuffix, allowGovSuffix ? 'true' : 'false');
  if (officialOnly !== undefined) await setSetting(KEYS.officialOnly, officialOnly ? 'true' : 'false');
  if (strictScope !== undefined) await setSetting(KEYS.strictScope, strictScope ? 'true' : 'false');
  if (useSources !== undefined) await setSetting(KEYS.useSources, useSources ? 'true' : 'false');

  await loadConfig();
  return getConfig();
};

module.exports = {
  KEYS,
  normalizeDomain,
  normalizeUrl,
  loadConfig,
  refresh,
  getConfig,
  getExtraDomains,
  getExtraIndexUrls,
  getAllowGovSuffix,
  getOfficialOnly,
  isStrictScope,
  usesRegisteredSources,
  getRegisteredDomains,
  updateConfig
};
