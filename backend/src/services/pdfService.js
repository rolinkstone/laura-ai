const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { cleanText } = require('./textProcessor');

/**
 * Mengekstrak teks dari file PDF, halaman per halaman.
 *
 * Alur: PDF → PDFParse (pdf-parse v2 / PDF.js) → teks per halaman → bersihkan.
 *
 * @param {string} filePath path file PDF
 * @returns {Promise<{ pages: Array<{page:number, text:string}>, numPages:number, info:object }>}
 */
const extractPages = async (filePath) => {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const parser = new PDFParse({ data });
  const result = await parser.getText();

  // v2 mengembalikan pages per halaman ({ num, text })
  const pages = (result.pages || [])
    .map((p) => ({ page: p.num, text: cleanText(p.text) }))
    .filter((p) => p.text.length > 0); // lewati halaman kosong

  let info = {};
  try {
    info = (await parser.getInfo()) || {};
  } catch {
    // metadata opsional — abaikan jika gagal
  }

  return {
    pages,
    numPages: result.total || pages.length,
    info
  };
};

module.exports = { extractPages };
