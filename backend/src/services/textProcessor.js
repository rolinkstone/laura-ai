/**
 * Pembersih teks hasil ekstraksi PDF.
 * Tujuan:
 *  - Normalisasi line ending
 *  - Hilangkan karakter kontrol / karakter tidak perlu
 *  - Rapikan spasi & baris kosong berlebih
 *  - Pertahankan struktur baris, paragraf, judul/section
 */
const cleanText = (raw = '') => {
  return raw
    .replace(/\r\n/g, '\n') // Windows → Unix
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // karakter kontrol
    .replace(/\f/g, '\n') // form feed → newline
    .replace(/[ \t]+/g, ' ') // spasi/tab ganda → satu spasi
    .replace(/ ?\n ?/g, '\n') // rapikan spasi di sekitar newline
    .replace(/\n{3,}/g, '\n\n') // baris kosong berlebih → maksimal 2
    .trim();
};

/**
 * Deteksi apakah sebuah baris merupakan judul/section.
 * Pola umum dokumen regulasi Indonesia:
 *  - "BAB I", "BAB II", "BAB 1"
 *  - "Bagian Kesatu", "Bagian Kedua"
 *  - "Pasal 1", "Pasal 2"
 *  - "Lampiran", "Lampiran I"
 *  - "1.1", "1.1.1", "1." (penomoran section)
 *  - "A.", "B." atau baris pendek HURUF BESAR
 */
const HEADING_RE =
  /^(BAB\s+[IVXLC\d]+|BAGIAN\s+\w+|PASAL\s+\d+|LAMPIRAN(\s+[IVXLC\dA-Za-z]+)?|\d+(\.\d+)*\.?\s+[A-Z]|[A-Z]\.\s+[A-Z]|[IVXLC]+\.\s+[A-Z])/i;

const isHeading = (line) => {
  const trimmed = (line || '').trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (HEADING_RE.test(trimmed)) return true;
  // Baris pendek HURUF BESAR (gaya judul umum)
  return (
    trimmed.length <= 60 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]{3,}/.test(trimmed) &&
    !/\d{2,}/.test(trimmed)
  );
};

/**
 * Membagi teks halaman menjadi chunk berdasarkan paragraf.
 * Mempertahankan:
 *  - Nomor halaman (field `page`)
 *  - Judul/section (field `section`) — dideteksi otomatis dari heading
 *
 * @param {Array<{page:number, text:string}>} pages
 * @param {number} chunkSize target ukuran chunk (karakter)
 * @returns {Array<{chunk_index:number, content:string, page:number, section:string|null}>}
 */
const chunkPages = (pages, chunkSize = 1200) => {
  const chunks = [];
  let buffer = '';
  let bufferStartPage = null; // halaman awal chunk (untuk sitasi)
  let bufferSection = null; // section pada awal chunk
  let currentSection = null; // section terakhir yang terdeteksi
  let chunkIndex = 0;

  const flush = () => {
    const content = buffer.trim();
    if (content.length > 0) {
      chunks.push({
        chunk_index: chunkIndex,
        content,
        page: bufferStartPage || 1,
        section: bufferSection || null
      });
      chunkIndex += 1;
      buffer = '';
      bufferStartPage = null;
      bufferSection = null;
    }
  };

  for (const page of pages) {
    const paragraphs = page.text.split(/\n{2,}/);

    for (const para of paragraphs) {
      // Deteksi section dari baris pertama paragraf
      const firstLine = para.split('\n')[0].trim();
      if (isHeading(firstLine)) {
        currentSection = firstLine.slice(0, 255);
      }

      const candidate = buffer ? `${buffer}\n\n${para}` : para;
      if (candidate.length <= chunkSize) {
        if (buffer === '') {
          bufferStartPage = page.page;
          bufferSection = currentSection;
        }
        buffer = candidate;
      } else {
        flush();
        buffer = para;
        bufferStartPage = page.page;
        bufferSection = currentSection;
      }
    }
  }
  flush();

  return chunks;
};

module.exports = { cleanText, chunkPages, isHeading };
