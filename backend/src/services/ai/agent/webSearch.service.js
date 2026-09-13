/**
 * WEB SEARCH — cabang "Official Websites" pada diagram pipeline AI Agent.
 *
 * Tanggung jawab:
 *  1. Mencari halaman di SITUS RESMI (pemerintah/instansi) untuk pertanyaan
 *     yang butuh informasi terkini/eksternal (kontak, jadwal, pengumuman,
 *     tautan unduhan, peraturan terbaru, dsb).
 *  2. Mengunduh konten halaman teratas sebagai bahan grounding + sitasi.
 *
 * Penyedia pencarian (dipilih otomatis bila WEB_SEARCH_PROVIDER=auto):
 *   tavily      → memakai TAVILY_API_KEY
 *   brave       → memakai BRAVE_SEARCH_API_KEY
 *   serpapi     → memakai SERPAPI_API_KEY
 *   duckduckgo  → tanpa API key (endpoint HTML publik)
 *   internal    → crawl halaman indeks resmi + tabel `sources` (tanpa internet search)
 *   off         → cabang web dimatikan
 *
 * SEMUA kegagalan jaringan ditangani: cabang web cukup mengembalikan daftar
 * kosong + catatan, pipeline utama tetap berjalan memakai RAG.
 */

const cheerio = require('cheerio');
const { pool } = require('../../../config/db');
const { fetchBuffer, fetchUrlContent, getHostname } = require('../../webScraper');
const { config } = require('./config');
const { isOfficialUrl, domainOf, getIndexPages, getAllowedDomains, getSearchDomains, getScope } = require('./officialSources');

const UA = 'Mozilla/5.0 (compatible; BBPOM-LAURA-Agent/1.0; +https://laura-ai.bbpompky.id)';

/**
 * Batasi durasi sebuah promise.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms, label) => {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${ms} ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Ambil HTML mentah (untuk ekstraksi tautan / hasil pencarian).
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
const fetchHtml = async (url, timeoutMs) => {
  const { buffer, contentType } = await withTimeout(fetchBuffer(url), timeoutMs, `ambil ${url}`);
  if (contentType && !/html|text\//i.test(contentType)) return null;
  return buffer.toString('utf8');
};

// ---------------------------------------------------------------------------
// Penyedia pencarian
// ---------------------------------------------------------------------------

const toResult = (raw) => ({
  title: String(raw.title || '').trim() || String(raw.url || '').trim(),
  url: String(raw.url || '').trim(),
  snippet: String(raw.snippet || '').replace(/\s+/g, ' ').trim(),
  score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : null
});

const tavilySearch = async (query, limit, timeoutMs) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY belum diisi');
  // Lingkup pencarian: batasi juga di sisi penyedia (bukan hanya saat memfilter hasil)
  const includeDomains = config().web.officialOnly ? getAllowedDomains() : [];
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      search_depth: 'basic',
      include_answer: false,
      ...(includeDomains.length > 0 ? { include_domains: includeDomains } : {})
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`Tavily API error ${res.status}`);
  const json = await res.json();
  return (json.results || []).map((r) => toResult({ title: r.title, url: r.url, snippet: r.content, score: r.score }));
};

const braveSearch = async (query, limit, timeoutMs) => {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY belum diisi');
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}&country=id`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`Brave API error ${res.status}`);
  const json = await res.json();
  return (json.web?.results || []).map((r) =>
    toResult({ title: r.title, url: r.url, snippet: r.description })
  );
};

const serpapiSearch = async (query, limit, timeoutMs) => {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY belum diisi');
  const url = `https://serpapi.com/search.json?engine=google&num=${limit}&hl=id&gl=id&api_key=${encodeURIComponent(
    apiKey
  )}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}`);
  const json = await res.json();
  return (json.organic_results || []).map((r) =>
    toResult({ title: r.title, url: r.link, snippet: r.snippet })
  );
};

/**
 * DuckDuckGo HTML (tanpa API key) — fallback gratis.
 */
const duckduckgoSearch = async (query, limit, timeoutMs) => {
  const body = new URLSearchParams({ q: query, kl: 'id-id' }).toString();
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Accept: 'text/html'
    },
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });

  // Catatan penting: DuckDuckGo menjawab 202 (bukan error HTTP) saat memblokir,
  // dengan halaman anti-bot tanpa satu pun hasil. Status 202 = `res.ok` true,
  // jadi HARUS diperiksa eksplisit agar tidak senyap "tidak ada hasil".
  if (res.status === 202 || !res.ok) {
    throw new Error(
      `DuckDuckGo memblokir permintaan (HTTP ${res.status}) — pasang TAVILY_API_KEY/BRAVE_SEARCH_API_KEY/SERPAPI_API_KEY, atau pakai WEB_SEARCH_PROVIDER=internal`
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const nodes = $('.result, .web-result');
  if (nodes.length === 0 && /anomaly|unusual traffic|challenge|captcha|robot/i.test(html)) {
    throw new Error('DuckDuckGo menampilkan halaman anti-bot (permintaan diblokir) — pakai API key atau mode internal');
  }

  const out = [];
  nodes.each((_, el) => {
    const link = $(el).find('a.result__a').first();
    const href = link.attr('href');
    if (!href) return;
    let url = href;
    // DDG membungkus tautan: /l/?uddg=<encoded>
    const m = href.match(/[?&]uddg=([^&]+)/);
    if (m) url = decodeURIComponent(m[1]);
    if (!/^https?:\/\//i.test(url)) return;
    out.push(
      toResult({
        title: link.text(),
        url,
        snippet: $(el).find('.result__snippet').first().text()
      })
    );
  });

  return out.slice(0, limit);
};

/**
 * Ambil daftar URL resmi yang sudah terdaftar admin (tabel `sources`).
 * URL boleh ditulis tanpa skema (mis. `palangkaraya.pom.go.id`) → dianggap https.
 * @returns {Promise<Array<{name: string, url: string}>>}
 */
const registeredSourceUrls = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT name, url FROM sources
        WHERE url IS NOT NULL AND url <> ''
        ORDER BY id DESC LIMIT 25`
    );
    return rows
      .map((r) => {
        const raw = String(r.url).trim();
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
          new URL(url);
          return { name: r.name, url };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`[agent:web] gagal membaca tabel sources: ${err.message}`);
    return [];
  }
};

const STOPWORDS = new Set([
  'yang', 'untuk', 'dengan', 'pada', 'dari', 'dalam', 'adalah', 'atau', 'dan', 'ini', 'itu',
  'apa', 'apakah', 'bagaimana', 'dimana', 'kapan', 'siapa', 'mengapa', 'kenapa', 'berapa',
  'saya', 'anda', 'kami', 'kita', 'bisa', 'dapat', 'tidak', 'akan', 'juga', 'agar', 'oleh',
  'tentang', 'informasi', 'mengenai', 'terbaru', 'terkini', 'cara', 'the', 'and', 'for', 'with'
]);

/**
 * Token kata kunci dari query (untuk pencocokan tautan, mode internal).
 * @param {string} query
 * @returns {string[]}
 */
const keywordsOf = (query) =>
  String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

/**
 * Mode `internal`: crawl halaman indeks resmi (default + tabel `sources`) lalu
 * pilih tautan yang paling cocok dengan kata kunci query.
 * @param {string[]} queries
 * @param {number} limit
 * @param {number} timeoutMs
 * @returns {Promise<Array>}
 */
const internalSearch = async (queries, limit, timeoutMs) => {
  const pages = [...getIndexPages(), ...(await registeredSourceUrls())];
  const keywords = [...new Set(queries.flatMap((q) => keywordsOf(q)))];
  const seen = new Map();

  // Hindari halaman yang sama diambil dua kali: `…/` vs `…`, dan
  // `pom.go.id` vs `www.pom.go.id` (host tanpa www sering tidak merespons).
  const normalizePage = (url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const path = u.pathname.replace(/\/+$/, '');
      return `${host}${path}`;
    } catch {
      return url.toLowerCase().replace(/\/+$/, '');
    }
  };
  const uniquePages = [];
  const seenPages = new Set();
  for (const page of pages) {
    const key = normalizePage(page.url);
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    uniquePages.push(page);
  }

  const crawl = async (page) => {
    try {
      const html = await fetchHtml(page.url, timeoutMs);
      if (!html) return [];
      const $ = cheerio.load(html);
      const base = new URL(page.url);
      const found = [];

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
        let abs;
        try {
          abs = new URL(href, base).toString();
        } catch {
          return;
        }
        if (!/^https?:/i.test(abs)) return;
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        const haystack = `${text} ${abs}`.toLowerCase();
        const hits = keywords.filter((k) => haystack.includes(k)).length;
        // Hanya tautan yang benar-benar memuat kata kunci query yang dipakai
        // (mencegah seluruh menu situs ikut masuk sebagai "hasil")
        if (keywords.length > 0 && hits === 0) return;
        if (!text && hits === 0) return;
        found.push(
          toResult({
            title: text || getHostname(abs),
            url: abs,
            snippet: text,
            score: keywords.length ? hits / keywords.length : 0.1
          })
        );
      });

      return found;
    } catch (err) {
      console.warn(`[agent:web] crawl ${page.url} gagal: ${err.message}`);
      return [];
    }
  };

  const crawled = await Promise.all(uniquePages.slice(0, 6).map(crawl));
  for (const item of crawled.flat()) {
    if (!seen.has(item.url)) seen.set(item.url, item);
  }

  return [...seen.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
};

/**
 * Tentukan penyedia pencarian yang dipakai.
 * @returns {string|null}
 */
const resolveProvider = () => {
  const configured = config().web.provider;
  if (configured === 'off') return null;
  if (configured && configured !== 'auto') return configured;
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.BRAVE_SEARCH_API_KEY) return 'brave';
  if (process.env.SERPAPI_API_KEY) return 'serpapi';
  return 'duckduckgo';
};

const PROVIDER_FNS = {
  tavily: tavilySearch,
  brave: braveSearch,
  serpapi: serpapiSearch,
  duckduckgo: duckduckgoSearch
};

// Batas jumlah panggilan ke mesin pencari (hindari fan-out berlebihan).
const MAX_PROVIDER_CALLS = 6;

/**
 * Ringkasan lingkup pencarian (domain yang boleh dipakai) untuk audit/trace.
 * @param {string[]} [queries] query yang benar-benar dikirim ke penyedia
 * @returns {{officialOnly: boolean, domains: string[], suffixes: string[], queries: string[]}}
 */
const baseScope = (queries = []) => ({
  officialOnly: config().web.officialOnly,
  domains: getAllowedDomains(),
  suffixes: getScope().suffixes,
  queries
});

/**
 * Batasi query ke dalam LINGKUP sumber yang diizinkan memakai operator `site:`
 * agar mesin pencari tidak menelusuri seluruh web (mis. memunculkan bpk.go.id
 * padahal lingkup hanya situs BPOM).
 *
 * - Lingkup kecil (<= 2 domain akar) → satu query per domain (paling andal).
 * - Lingkup lebih besar → satu query dengan `(site:a OR site:b ...)`.
 *
 * @param {string[]} queries
 * @param {boolean} officialOnly
 * @returns {string[]}
 */
const buildScopedQueries = (queries, officialOnly) => {
  const list = (queries || []).map((q) => String(q || '').trim()).filter(Boolean);
  if (!officialOnly) return list.slice(0, 3);

  const domains = getSearchDomains(4);
  if (domains.length === 0) return list.slice(0, 3);

  const out = [];
  if (domains.length <= 2) {
    for (const q of list) for (const d of domains) out.push(`${q} site:${d}`);
  } else {
    const clause = `(${domains.map((d) => `site:${d}`).join(' OR ')})`;
    for (const q of list) out.push(`${q} ${clause}`);
  }
  return [...new Set(out)].slice(0, MAX_PROVIDER_CALLS);
};

// ---------------------------------------------------------------------------
// Normalisasi + pengayaan konten
// ---------------------------------------------------------------------------

/**
 * Buang hasil duplikat / non-http.
 * @param {Array} results
 * @returns {Array}
 */
const dedupeResults = (results) => {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (!r.url || !/^https?:\/\//i.test(r.url)) continue;
    const key = r.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};

/**
 * Unduh konten halaman teratas sebagai bahan jawaban.
 * @param {Array} results
 * @param {number} fetchTop
 * @param {number} timeoutMs
 * @param {number} maxChars
 * @returns {Promise<Array>}
 */
const enrichWithContent = async (results, fetchTop, timeoutMs, maxChars) => {
  const targets = results.slice(0, fetchTop);
  await Promise.all(
    targets.map(async (r) => {
      try {
        const content = await withTimeout(fetchUrlContent(r.url), timeoutMs, `unduh ${r.url}`);
        if (content.type === 'html' && content.text) {
          if (!r.title || r.title === r.url) r.title = content.pageTitle || r.title;
          r.content = content.text.slice(0, maxChars);
          r.fetched = true;
        }
      } catch (err) {
        r.fetch_error = err.message;
        console.warn(`[agent:web] konten ${r.url} gagal diunduh: ${err.message}`);
      }
    })
  );
  return results;
};

/**
 * WEB SEARCH utama.
 *
 * @param {{queries: string[], limit?: number}} param
 * @returns {Promise<{results: Array, provider: string|null, notes: string[]}>}
 */
const webSearch = async ({ queries = [], limit = null }) => {
  const cfg = config();
  const notes = [];

  if (!cfg.web.enabled) {
    return { results: [], provider: null, notes: ['cabang web dinonaktifkan'], scope: baseScope() };
  }

  const provider = resolveProvider();
  if (!provider) return { results: [], provider: null, notes: ['WEB_SEARCH_PROVIDER=off'], scope: baseScope() };

  const max = Math.max(1, Math.min(Number(limit) || cfg.web.results, 10));
  const cleanQueries = [...new Set(queries.map((q) => String(q || '').trim()).filter(Boolean))].slice(0, 3);
  if (cleanQueries.length === 0) return { results: [], provider, notes: ['query kosong'], scope: baseScope() };

  const timeoutMs = Math.max(3000, cfg.web.fetchTimeoutMs);
  const raw = [];

  // 1. Query yang berupa URL langsung diperlakukan sebagai sumber web.
  const directUrls = cleanQueries.filter((q) => /^https?:\/\//i.test(q));
  for (const url of directUrls) {
    raw.push(toResult({ title: getHostname(url), url, snippet: 'URL yang disebut pengguna', score: 1 }));
  }

  // 2. Pencarian lewat penyedia — query dibatasi ke domain dalam lingkup.
  const searchQueries = cleanQueries.filter((q) => !/^https?:\/\//i.test(q));
  // Mode `internal` sudah terbatas pada halaman indeks resmi (tanpa `site:`).
  const providerQueries =
    provider === 'internal' ? searchQueries : buildScopedQueries(searchQueries, cfg.web.officialOnly);
  if (providerQueries.length > 0) {
    const fn = provider === 'internal' ? internalSearch : PROVIDER_FNS[provider];
    if (!fn) {
      notes.push(`penyedia "${provider}" tidak dikenal`);
    } else {
      try {
        const perQuery = await Promise.all(
          providerQueries.map((q) =>
            fn(q, max, timeoutMs).catch((err) => {
              notes.push(`${provider} gagal untuk "${q.slice(0, 60)}": ${err.message}`);
              return [];
            })
          )
        );
        for (const list of perQuery) raw.push(...list);
      } catch (err) {
        notes.push(`${provider} gagal: ${err.message}`);
      }
    }
  }

  // 2b. Fallback: penyedia pencarian tidak menghasilkan apa pun (mis. DuckDuckGo
  // memblokir dengan 202/anti-bot) → crawl halaman indeks resmi yang terdaftar.
  if (raw.length === 0 && provider !== 'internal' && cfg.web.fallbackInternal) {
    const startedAt = Date.now();
    const crawled = await Promise.all(
      cleanQueries.slice(0, 2).map((q) =>
        internalSearch([q], max, timeoutMs).catch((err) => {
          notes.push(`fallback internal gagal untuk "${q.slice(0, 40)}": ${err.message}`);
          return [];
        })
      )
    );
    const flat = crawled.flat();
    if (flat.length > 0) {
      raw.push(...flat);
      notes.push(
        `provider "${provider}" tidak menghasilkan apa pun → dipakai halaman indeks resmi (mode internal), ${flat.length} tautan`
      );
      console.log(`[agent:web] fallback internal: ${flat.length} tautan dalam ${Date.now() - startedAt} ms`);
    }
  }

  // 3. Kebijakan sumber resmi (lingkup).
  let results = dedupeResults(raw);
  if (cfg.web.officialOnly) {
    const outside = results.filter((r) => !isOfficialUrl(r.url));
    results = results.filter((r) => isOfficialUrl(r.url));
    const outsideDomains = [...new Set(outside.map((r) => domainOf(r.url)).filter(Boolean))];
    if (outsideDomains.length > 0) {
      notes.push(`di luar lingkup (dibuang): ${outsideDomains.slice(0, 6).join(', ')}`);
    }
  }

  results = results.slice(0, max).map((r) => ({
    ...r,
    origin: 'web',
    domain: domainOf(r.url),
    content: r.snippet || '',
    fetched: false
  }));

  // 4. Grounding: unduh konten halaman teratas.
  const fetchTop = Math.max(0, Math.min(Number(cfg.web.fetchTop) || 0, results.length));
  if (fetchTop > 0) {
    await enrichWithContent(results, fetchTop, timeoutMs, cfg.web.contentChars);

    // Situs pemerintah sering punya rantai sertifikat tidak lengkap.
    const tlsFailed = results.filter((r) => r.fetch_error && /certificat|TLS|CERT/i.test(r.fetch_error));
    if (tlsFailed.length > 0 && String(process.env.WEB_ALLOW_INSECURE_TLS) !== 'true') {
      notes.push(
        `${tlsFailed.length} halaman gagal diunduh (sertifikat TLS situs tidak lengkap) — isi hanya bila diperlukan: WEB_ALLOW_INSECURE_TLS=true`
      );
    }
  }

  if (results.length === 0 && notes.length === 0) notes.push('tidak ada hasil web yang relevan');

  return {
    results,
    provider,
    notes,
    // Lingkup pencarian yang dipakai — tampil di trace agent untuk audit
    scope: {
      officialOnly: cfg.web.officialOnly,
      domains: getAllowedDomains(),
      suffixes: getScope().suffixes,
      queries: providerQueries
    }
  };
};

module.exports = {
  webSearch,
  resolveProvider,
  buildScopedQueries,
  internalSearch,
  registeredSourceUrls,
  getAllowedDomains,
  getSearchDomains,
  isOfficialUrl
};
