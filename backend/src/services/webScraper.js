const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const { cleanText } = require('./textProcessor');

/**
 * Web scraper untuk mengubah URL (HTML atau PDF) menjadi teks.
 * Dipakai oleh fitur "Tambah Dokumen dari URL".
 *
 * Catatan TLS: beberapa situs pemerintah memiliki rantai sertifikat
 * yang tidak lengkap (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Untuk situs
 * seperti itu, set WEB_ALLOW_INSECURE_TLS=true di .env.
 * ⚠️ Jangan aktifkan di produksi tanpa evaluasi keamanan.
 */

const ALLOW_INSECURE_TLS = process.env.WEB_ALLOW_INSECURE_TLS === 'true';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BBPOM-AI-Assistant/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id,en;q=0.8'
};

/**
 * Unduh konten URL menjadi Buffer (mendukung redirect, max 30 detik).
 * @param {string} url
 * @param {number} redirects
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
const fetchBuffer = (url, redirects = 0) =>
  new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error('URL tidak valid'));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const options = { headers: HEADERS, timeout: 30000 };
    if (ALLOW_INSECURE_TLS) {
      options.rejectUnauthorized = false;
    }

    const req = lib.get(parsed, options, (res) => {
      // Redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) {
          return reject(new Error('Terlalu banyak redirect'));
        }
        const next = new URL(res.headers.location, parsed).toString();
        return fetchBuffer(next, redirects + 1).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Gagal mengakses URL (HTTP ${res.statusCode})`));
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' })
      );
    });

    req.on('timeout', () => req.destroy(new Error('Timeout mengambil URL (30 detik)')));
    req.on('error', (err) => reject(new Error(`Gagal mengambil URL: ${err.message}`)));
  });

/**
 * Ambil konten dari URL.
 * @param {string} url
 * @returns {Promise<{type:'html', text:string, pageTitle:string|null}|{type:'pdf', buffer:Buffer}>}
 */
const fetchUrlContent = async (url) => {
  const { buffer, contentType } = await fetchBuffer(url);

  if (contentType.includes('application/pdf')) {
    return { type: 'pdf', buffer };
  }

  if (contentType.includes('html') || contentType.includes('text/')) {
    const html = buffer.toString('utf8');
    const pageTitle = extractTitle(html);
    const text = extractMainText(html);
    if (!text || text.trim().length < 20) {
      throw new Error('Tidak ada konten teks yang dapat diekstrak dari halaman URL');
    }
    return { type: 'html', text: cleanText(text), pageTitle };
  }

  throw new Error(`Tipe konten tidak didukung: ${contentType}`);
};

const extractTitle = (html) => {
  try {
    const $ = cheerio.load(html);
    return $('title').first().text().trim() || null;
  } catch {
    return null;
  }
};

/**
 * Ekstrak teks utama dari HTML (buang nav/footer/sidebar/script).
 */
const extractMainText = (html) => {
  const $ = cheerio.load(html);

  $('script, style, noscript, nav, header, footer, aside, iframe, svg, form, button, input, .menu, .navbar, .nav, .sidebar, .footer, .widget, .breadcrumb, .pagination').remove();

  let main = $('article').first();
  if (main.length === 0) main = $('main').first();
  if (main.length === 0) main = $('[role="main"]').first();
  if (main.length === 0) main = $('.post-content, .entry-content, .article-content, .content, #content').first();
  if (main.length === 0) main = $('body');

  return main.text() || '';
};

const getHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

module.exports = { fetchUrlContent, fetchBuffer, extractTitle, extractMainText, getHostname, ALLOW_INSECURE_TLS };
