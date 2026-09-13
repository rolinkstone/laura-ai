const { pool } = require('../config/db');

/**
 * Penyimpanan konfigurasi runtime (key-value) di tabel `settings`.
 * Fallback ke nilai default bila belum tersimpan.
 */

const getSetting = async (key) => {
  const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value ?? null;
};

const setSetting = async (key, value) => {
  await pool.query(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [key, value === undefined ? null : value]
  );
};

const getAllSettings = async () => {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
  const out = {};
  for (const r of rows) out[r.setting_key] = r.setting_value;
  return out;
};

module.exports = { getSetting, setSetting, getAllSettings };
