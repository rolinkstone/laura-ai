/**
 * Kebijakan sumber web RESMI (Official Websites).
 *
 * Dipakai oleh `webSearch.service.js` untuk:
 *  - memfilter hasil pencarian web hanya dari situs resmi (pemerintah/instansi)
 *  - menyediakan halaman indeks resmi yang boleh di-crawl saat tidak ada
 *    penyedia search API (mode fallback `internal`)
 *
 * Daftar dapat ditambah lewat .env tanpa mengubah kode:
 *   WEB_SEARCH_ALLOWED_DOMAINS=contoh.go.id,situs-resmi.id
 *   WEB_SEARCH_INDEX_URLS=https://www.pom.go.id/,https://contoh.go.id/
 *   WEB_SEARCH_ALLOW_GOID_SUFFIX=true   # izinkan SEMUA *.go.id (opsional)
 */

const { list, bool } = require('./config');
// Pengaturan dari dashboard admin (tabel `settings`) — menimpa/menambah daftar .env
const webCfg = require('../../webSearchConfigService');

// Lingkup DEFAULT: hanya keluarga situs BPOM + domain instansi sendiri.
// Domain pemerintah lain (mis. bpk.go.id, kemenkes.go.id) TIDAK termasuk —
// tambahkan eksplisit lewat WEB_SEARCH_ALLOWED_DOMAINS bila memang diinginkan.
const DEFAULT_ALLOWED_DOMAINS = [
  'pom.go.id',
  'bpom.go.id',
  'bbpom.go.id',
  'cekbpom.pom.go.id',
  'bbpompky.id'
];

// Suffix domain yang otomatis dianggap resmi. KOSONG secara default:
// mengizinkan seluruh *.go.id bersifat opt-in (WEB_SEARCH_ALLOW_GOID_SUFFIX=true)
// karena dapat memunculkan situs pemerintah di luar lingkup (mis. bpk.go.id).
const DEFAULT_ALLOWED_SUFFIXES = [];

// Halaman indeks resmi untuk mode `internal` (crawl + pencocokan kata kunci).
const DEFAULT_INDEX_PAGES = [
  { name: 'BPOM RI', url: 'https://www.pom.go.id/' },
  { name: 'Cek BPOM', url: 'https://cekbpom.pom.go.id/' }
];

/**
 * Domain yang boleh dipakai sebagai sumber (LINGKUP pencarian):
 * default (keluarga BPOM) + WEB_SEARCH_ALLOWED_DOMAINS + domain dari
 * WEB_SEARCH_INDEX_URLS (halaman indeks yang didaftarkan dianggap dalam lingkup).
 * @returns {string[]}
 */
/**
 * Domain yang boleh dipakai sebagai sumber (LINGKUP pencarian), urutan prioritas:
 *   1. domain dari menu Sumber (tabel `sources`) — "link yang diinput admin"
 *   2. daftar tambahan dari dashboard (tabel `settings`)
 *   3. WEB_SEARCH_ALLOWED_DOMAINS (.env)
 *   4. bawaan sistem (keluarga BPOM) — dilewati bila mode "hanya daftar ini"
 *   5. domain halaman indeks (WEB_SEARCH_INDEX_URLS)
 * @returns {string[]}
 */
const getAllowedDomains = () => {
  const envDomains = list(process.env.WEB_SEARCH_ALLOWED_DOMAINS).map((d) => d.toLowerCase().replace(/^\./, ''));
  const dashboardDomains = webCfg.getExtraDomains();
  const sourceDomains = webCfg.usesRegisteredSources() ? webCfg.getRegisteredDomains() : [];
  const indexDomains = getIndexPages()
    .map((p) => domainOf(p.url))
    .filter(Boolean);

  // "Hanya pakai daftar ini" → abaikan domain bawaan sistem.
  const base = webCfg.isStrictScope() ? [] : DEFAULT_ALLOWED_DOMAINS;
  const all = [...sourceDomains, ...dashboardDomains, ...base, ...envDomains, ...indexDomains];
  return [...new Set(all.filter(Boolean))];
};

/**
 * Suffix domain yang dianggap resmi (lihat DEFAULT_ALLOWED_SUFFIXES).
 * @returns {string[]}
 */
const getAllowedSuffixes = () => {
  // Prioritas: pengaturan dashboard → .env → default (nonaktif)
  const override = webCfg.getAllowGovSuffix();
  const allowGov = override === null || override === undefined ? bool(process.env.WEB_SEARCH_ALLOW_GOID_SUFFIX, false) : override;
  const gov = allowGov ? ['.go.id'] : [];
  const extra = list(process.env.WEB_SEARCH_ALLOWED_SUFFIXES).map((d) => d.toLowerCase());
  return [...new Set([...DEFAULT_ALLOWED_SUFFIXES, ...gov, ...extra])];
};

/**
 * Domain AKAR untuk membatasi query ke mesin pencari (`site:`),
 * sehingga mesin pencari tidak dibiarkan menelusuri seluruh web.
 * Contoh: cekbpom.pom.go.id → pom.go.id
 * @param {number} [max] jumlah maksimal domain
 * @returns {string[]}
 */
const getSearchDomains = (max = 4) => {
  const roots = new Set();
  for (const d of getAllowedDomains()) {
    const parts = d.split('.');
    roots.add(parts.length > 3 ? parts.slice(-3).join('.') : d);
  }
  return [...roots].slice(0, max);
};

/**
 * Ringkasan lingkup untuk trace/observability.
 * @returns {{domains: string[], suffixes: string[], searchDomains: string[]}}
 */
const getScope = () => ({
  domains: getAllowedDomains(),
  suffixes: getAllowedSuffixes(),
  searchDomains: getSearchDomains()
});

/**
 * Ambil hostname dari URL (tanpa `www.`).
 * @param {string} url
 * @returns {string|null}
 */
const domainOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * Apakah URL berasal dari situs resmi?
 * @param {string} url
 * @returns {boolean}
 */
const isOfficialUrl = (url) => {
  const host = domainOf(url);
  if (!host) return false;
  const domains = getAllowedDomains();
  if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  return getAllowedSuffixes().some((s) => host.endsWith(s));
};

/**
 * Halaman indeks resmi (default + tambahan dari env).
 * @returns {Array<{name: string, url: string}>}
 */
const getIndexPages = () => {
  const extra = list(process.env.WEB_SEARCH_INDEX_URLS)
    .filter((u) => /^https?:\/\//i.test(u))
    .map((url) => ({ name: domainOf(url) || url, url }));
  const merged = [...DEFAULT_INDEX_PAGES, ...extra];
  const seen = new Set();
  return merged.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
};

module.exports = {
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_INDEX_PAGES,
  getAllowedDomains,
  getAllowedSuffixes,
  getSearchDomains,
  getScope,
  getIndexPages,
  domainOf,
  isOfficialUrl
};
