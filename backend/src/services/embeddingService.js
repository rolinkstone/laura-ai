const { pipeline } = require('@xenova/transformers');

/**
 * Model embedding lokal (transformers.js) — tanpa API key.
 * Model diunduh dari HuggingFace pada pemakaian pertama.
 */
const MODEL = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';

/**
 * Jumlah teks per panggilan model.
 *
 * Pemakaian memori model tumbuh ~ batch × panjang_sekuens² (matriks attention),
 * sehingga mengirim SELURUH chunk sekaligus membuat ONNX meminta memori belasan
 * GB pada dokumen besar (mis. 1000 chunk × 500 token ≈ 12 GB) → alokasi gagal,
 * proses Node mati, dan browser melaporkan "Failed to fetch".
 * 16 teks per panggilan menjaga memori tetap rendah (± 200 MB) dan aman di CPU.
 */
const BATCH_SIZE = Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE) || 16);

/**
 * Batas panjang teks (karakter) yang dikirim ke model. e5 hanya membaca 512
 * token pertama, jadi memotong di sini tidak mengurangi mutu, tetapi panjang
 * sekuens (dan memori) tetap terkendali.
 */
const MAX_CHARS = Math.max(200, Number(process.env.EMBEDDING_MAX_CHARS) || 2000);

const trim = (text) => (text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text);

let extractor = null;

const getExtractor = async () => {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', MODEL);
  }
  return extractor;
};

/**
 * Embed satu teks → vektor 1 dimensi.
 * @param {string} text
 * @param {string} prefix awalan model (mis. 'query: ' atau 'passage: ')
 * @returns {Promise<number[]>}
 */
const embed = async (text, prefix = '') => {
  const ex = await getExtractor();
  const out = await ex(trim(prefix + text), { pooling: 'mean', normalize: true });
  return Array.from(out.data);
};

/**
 * Embed banyak teks secara BERTAHAP (BATCH_SIZE teks per panggilan model).
 * Bertahap — bukan satu panggilan raksasa — agar pemakaian memori ONNX
 * terbatas dan proses tidak tumbang saat dokumen besar diproses.
 *
 * @param {string[]} texts
 * @param {string} prefix awalan model (mis. 'passage: ')
 * @param {{batchSize?: number, onProgress?: (done:number, total:number) => void}} [options]
 * @returns {Promise<number[][]>}
 */
const embedBatch = async (texts, prefix = '', options = {}) => {
  if (!texts || texts.length === 0) return [];

  const ex = await getExtractor();
  const batchSize = Math.max(1, Number(options.batchSize) || BATCH_SIZE);
  const onProgress = options.onProgress;
  const vectors = [];

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize).map((t) => trim(prefix + t));
    const out = await ex(batch, { pooling: 'mean', normalize: true });
    const dim = out.dims[out.dims.length - 1];
    const data = Array.from(out.data);

    for (let i = 0; i < batch.length; i++) {
      vectors.push(data.slice(i * dim, (i + 1) * dim));
    }

    if (onProgress) onProgress(vectors.length, texts.length);
  }

  return vectors;
};

module.exports = { embed, embedBatch, MODEL, BATCH_SIZE };
