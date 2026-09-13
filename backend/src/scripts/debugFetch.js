/**
 * Debug: uji ambil konten URL via webScraper.
 * Jalankan: node src/scripts/debugFetch.js [url]
 */
require('dotenv').config();
const { fetchUrlContent } = require('../services/webScraper');

const url = process.argv[2] || 'https://palangkaraya.pom.go.id/berita/layanan-informasi';

(async () => {
  try {
    const content = await fetchUrlContent(url);
    if (content.type === 'pdf') {
      console.log('✅ type: pdf | bytes:', content.buffer.length);
    } else {
      console.log('✅ type:', content.type);
      console.log('   title  :', content.pageTitle);
      console.log('   chars  :', content.text.length);
      console.log('   --- awal teks ---');
      console.log(content.text.slice(0, 400));
    }
  } catch (err) {
    console.log('❌ ERROR:', err.message);
  }
})();
