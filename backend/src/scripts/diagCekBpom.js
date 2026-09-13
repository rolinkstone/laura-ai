/**
 * Diagnosa sementara: apakah data "cek produk" dari cekbpom.pom.go.id bisa
 * dibaca oleh pipeline web search (static fetch + ekstraksi teks)?
 *
 * Jalankan: node src/scripts/diagCekBpom.js
 */

const { fetchUrlContent, fetchBuffer } = require('../services/webScraper');
const { webSearch } = require('../services/ai/agent/webSearch.service');

const URL_PAGE = 'https://cekbpom.pom.go.id/produk-obat';
const NIE = 'GKL1713713144A1';

(async () => {
  console.log('=== 1) Ambil halaman HTML (seperti yang dilakukan agent) ===');
  try {
    const res = await fetchUrlContent(URL_PAGE);
    console.log('tipe:', res.type);
    const text = (res.text || '').replace(/\s+/g, ' ');
    console.log('panjang teks:', text.length);
    console.log('cuplikan:', text.slice(0, 400));
    console.log('mengandung "GKL" ?', /GKL/i.test(text));
    console.log('mengandung "login" ?', /login|masuk/i.test(text));
  } catch (err) {
    console.log('GAGAL:', err.message);
  }

  console.log('\n=== 2) Lihat apakah HTML memuat endpoint/API dinamis ===');
  try {
    const { buffer, contentType } = await fetchBuffer(URL_PAGE);
    const html = buffer.toString('utf8');
    console.log('content-type:', contentType, '| panjang HTML:', html.length);
    const apiHits = [...new Set((html.match(/["'(][^"'()\s]*(?:api|graphql)[^"'()\s]*/gi) || []))].slice(0, 8);
    console.log('petunjuk API di HTML:', apiHits.length ? apiHits : '(tidak ada)');
    const scripts = (html.match(/src="([^"]+\.js[^"]*)"/g) || []).slice(0, 5);
    console.log('script utama:', scripts);
  } catch (err) {
    console.log('GAGAL:', err.message);
  }

  console.log('\n=== 3) Uji web search untuk nomor registrasi tersebut ===');
  try {
    const res = await webSearch({ queries: [`cek produk ${NIE}`, `nomor registrasi ${NIE}`], limit: 5 });
    console.log('penyedia:', res.provider);
    console.log('query:', res.scope?.queries);
    console.log('catatan:', res.notes);
    res.results.forEach((r) =>
      console.log(`- [${r.score === null ? '-' : r.score}] ${r.domain} | ${String(r.title).slice(0, 60)} | konten:${(r.content || '').length} char | fetched:${r.fetched}`)
    );
  } catch (err) {
    console.log('GAGAL:', err.message);
  }

  console.log('\n=== 4) Cari mekanisme pencarian di halaman (form / ajax) ===');
  try {
    const { buffer } = await fetchBuffer(URL_PAGE);
    const html = buffer.toString('utf8');
    const forms = (html.match(/<form[\s\S]{0,300}?>/gi) || []).map((f) => f.replace(/\s+/g, ' '));
    console.log('form:', forms.slice(0, 5));
    const urls = [...new Set(html.match(/url\s*:\s*["'][^"']+["']/gi) || [])].slice(0, 10);
    console.log('url: pada JS:', urls);
    const posts = [...new Set(html.match(/\.(post|get)\(\s*["'][^"']+["']/gi) || [])].slice(0, 10);
    console.log('.post/.get:', posts);
    const inline = (html.match(/<script(?![^>]*src)[^>]*>[\s\S]*?<\/script>/gi) || [])
      .filter((s) => /produk|registrasi|search/i.test(s))
      .map((s) => s.replace(/\s+/g, ' ').slice(0, 260));
    console.log('inline script relevan:', inline.slice(0, 3));
  } catch (err) {
    console.log('GAGAL:', err.message);
  }

  console.log('\n=== 5) Coba beberapa pola URL pencarian langsung ===');
  const candidates = [
    `${URL_PAGE}?search=${NIE}`,
    `${URL_PAGE}?keyword=${NIE}`,
    `${URL_PAGE}?q=${NIE}`,
    `https://cekbpom.pom.go.id/produk-obat/search?keyword=${NIE}`
  ];
  for (const url of candidates) {
    try {
      const { buffer } = await fetchBuffer(url);
      const html = buffer.toString('utf8');
      console.log(`${url} -> ${html.length} char | ada NIE? ${html.includes(NIE)}`);
      if (html.includes(NIE)) {
        const idx = html.indexOf(NIE);
        console.log('   cuplikan:', html.slice(Math.max(0, idx - 200), idx + 200).replace(/\s+/g, ' '));
      }
    } catch (err) {
      console.log(`${url} -> GAGAL: ${err.message}`);
    }
  }
})();
