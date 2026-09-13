/**
 * Diagnosa: daftar tautan pada halaman indeks resmi yang terdaftar.
 * Dipakai untuk menyusun contoh pertanyaan yang tepat mengarah ke web search.
 *
 * Jalankan: node src/scripts/diagIndexLinks.js
 */

require('dotenv').config();
const cheerio = require('cheerio');
const { fetchBuffer } = require('../services/webScraper');

const PAGES = [
  'https://www.pom.go.id/',
  'https://jdih.pom.go.id/',
  'https://palangkaraya.pom.go.id/',
  'https://cekbpom.pom.go.id/'
];

(async () => {
  for (const page of PAGES) {
    try {
      const { buffer, contentType } = await fetchBuffer(page);
      const html = buffer.toString('utf8');
      const $ = cheerio.load(html);
      const links = [];

      $('a[href]').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        let href = $(el).attr('href');
        if (!href || text.length < 3) return;
        try {
          href = new URL(href, page).toString();
        } catch {
          return;
        }
        links.push(`${text.slice(0, 55)} => ${href}`);
      });

      const unique = [...new Set(links)];
      console.log(`\n=== ${page} (${contentType?.slice(0, 30)} | ${unique.length} tautan) ===`);
      console.log(unique.slice(0, 30).join('\n'));
    } catch (err) {
      console.log(`\n=== ${page} GAGAL: ${err.message}`);
    }
  }
})();
