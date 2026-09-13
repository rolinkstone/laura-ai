const { getSetting, setSetting } = require('./settingsService');

/**
 * Konfigurasi LLM runtime — dibaca dari tabel `settings` (DB) dengan fallback ke .env.
 * Dapat diubah dari dashboard TANPA restart (nilai di-cache di memori dan
 * disegarkan setiap kali pengaturan disimpan).
 *
 * Tidak pernah mengekspos API key via endpoint (hanya status terkonfigurasi).
 */

// Provider tunggal: 9Router (AI gateway OpenAI-compatible) — cukup 1 API key
// untuk mengakses semua model. Nama provider internal: 'ninerouter'.
const PROVIDER_NAMES = ['ninerouter'];

const DEFAULT_MODELS = {
  // kr/auto = model otomatis 9Router — pilih provider/model gratis yang tersedia
  ninerouter: 'kr/auto'
};

// Base URL default gateway 9Router (dipakai bila tidak ada setting/env).
const DEFAULT_BASE_URL = 'http://localhost:20128/v1';

let state = null;

const envDefault = (key) => process.env[key] || null;

const buildStateFromEnv = () => ({
  enabled: envDefault('LLM_ENABLED') !== 'false',
  providerOrder: (envDefault('AI_PROVIDER') || 'ninerouter')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  providers: {
    ninerouter: {
      apiKey: envDefault('NINEROUTER_API_KEY'),
      model: envDefault('NINEROUTER_MODEL') || DEFAULT_MODELS.ninerouter,
      baseUrl: envDefault('NINEROUTER_BASE_URL') || DEFAULT_BASE_URL
    }
  }
});

/**
 * Muat konfigurasi dari DB (override env) ke memori.
 */
const loadConfig = async () => {
  state = buildStateFromEnv();

  const enabled = await getSetting('llm_enabled');
  if (enabled !== null) state.enabled = enabled === 'true';

  const order = await getSetting('ai_provider');
  if (order) {
    // Filter ke provider yang dikenal — hindari nilai lama (mis. 'opencode,gemini')
    // yang tersimpan di DB dari versi sebelumnya.
    const filtered = order
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => PROVIDER_NAMES.includes(n));
    if (filtered.length) state.providerOrder = filtered;
  }

  for (const name of PROVIDER_NAMES) {
    const key = await getSetting(`${name}_api_key`);
    if (key !== null) state.providers[name].apiKey = key;

    const model = await getSetting(`${name}_model`);
    if (model) state.providers[name].model = model;

    const baseUrl = await getSetting(`${name}_base_url`);
    if (baseUrl) state.providers[name].baseUrl = baseUrl;
  }

  return state;
};

const getConfig = () => {
  if (!state) state = buildStateFromEnv();
  return state;
};

const isEnabled = () => getConfig().enabled;

const getProviderOrder = () => {
  const order = getConfig().providerOrder.filter((n) => PROVIDER_NAMES.includes(n));
  return order.length ? order : ['ninerouter'];
};

const getApiKey = (name) => getConfig().providers[name]?.apiKey || null;

const getModel = (name) => getConfig().providers[name]?.model || DEFAULT_MODELS[name] || null;

const getBaseUrl = (name) => getConfig().providers[name]?.baseUrl || DEFAULT_BASE_URL;

const isProviderConfigured = (name) => !!getApiKey(name);

/**
 * Simpan pengaturan LLM.
 * Konvensi field API key:
 *  - field TIDAK dikirim (undefined) → jangan ubah
 *  - field '' → hapus/clear (fallback ke .env)
 *  - field non-empty → simpan
 *
 * @returns {Promise<object>} tampilan publik konfigurasi (tanpa key)
 */
const updateConfig = async ({
  enabled,
  providerOrder,
  ninerouter_model,
  ninerouter_api_key,
  ninerouter_base_url
} = {}) => {
  if (enabled !== undefined) await setSetting('llm_enabled', enabled ? 'true' : 'false');
  if (providerOrder !== undefined) await setSetting('ai_provider', providerOrder);

  if (ninerouter_model !== undefined && ninerouter_model !== null) {
    await setSetting('ninerouter_model', String(ninerouter_model));
  }

  if (ninerouter_api_key !== undefined) {
    // '' → simpan string kosong = nonaktifkan provider (override .env);
    // non-empty → simpan; undefined → jangan ubah
    await setSetting('ninerouter_api_key', ninerouter_api_key);
  }

  if (ninerouter_base_url !== undefined) {
    // ''/null → hapus (fallback ke .env/default); non-empty → simpan (tanpa slash di akhir)
    const normalized = ninerouter_base_url ? String(ninerouter_base_url).replace(/\/+$/, '') : null;
    await setSetting('ninerouter_base_url', normalized);
  }

  await loadConfig();
  return getPublicConfig();
};

/**
 * Tampilan publik (aman): tanpa API key, hanya status terkonfigurasi.
 */
const getPublicConfig = () => {
  const c = getConfig();
  return {
    enabled: c.enabled,
    providerOrder: getProviderOrder(),
    baseUrl: getBaseUrl('ninerouter'),
    models: {
      ninerouter: c.providers.ninerouter.model
    },
    configured: {
      ninerouter: !!c.providers.ninerouter.apiKey
    }
  };
};

/**
 * Batas token output LLM (default 4096; ubah via LLM_MAX_TOKENS di .env).
 * 1000 token terlalu pendek dan membuat jawaban terpotong.
 */
const getMaxTokens = () => Number(process.env.LLM_MAX_TOKENS) || 4096;

module.exports = {
  loadConfig,
  getConfig,
  getPublicConfig,
  updateConfig,
  isEnabled,
  getProviderOrder,
  getApiKey,
  getModel,
  getBaseUrl,
  getMaxTokens,
  isProviderConfigured,
  DEFAULT_MODELS
};
