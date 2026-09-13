const { pipeline } = require('@xenova/transformers');

/**
 * Model embedding lokal (transformers.js) — tanpa API key.
 * Model diunduh dari HuggingFace pada pemakaian pertama.
 */
const MODEL = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';

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
  const out = await ex(prefix + text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
};

/**
 * Embed banyak teks sekaligus (satu panggilan model).
 * @param {string[]} texts
 * @param {string} prefix
 * @returns {Promise<number[][]>}
 */
const embedBatch = async (texts, prefix = '') => {
  if (!texts || texts.length === 0) return [];
  const ex = await getExtractor();
  const out = await ex(texts.map((t) => prefix + t), { pooling: 'mean', normalize: true });
  const dim = out.dims[out.dims.length - 1];
  const data = Array.from(out.data);

  const vectors = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(data.slice(i * dim, (i + 1) * dim));
  }
  return vectors;
};

module.exports = { embed, embedBatch, MODEL };
