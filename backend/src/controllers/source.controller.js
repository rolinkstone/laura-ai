const { pool } = require('../config/db');
const { recordAudit } = require('../services/auditService');
const webSearchConfig = require('../services/webSearchConfigService');

/**
 * Ruang lingkup pencarian web diturunkan dari URL pada daftar Sumber ini
 * (lihat `webSearchConfigService`). Segarkan cache setelah data berubah agar
 * domain baru langsung dipakai pada chat berikutnya.
 */
const refreshWebScope = async () => {
  try {
    await webSearchConfig.refresh();
  } catch (err) {
    console.warn(`[sources] gagal menyegarkan ruang lingkup web: ${err.message}`);
  }
};

/**
 * GET /api/sources
 */
const getSources = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sources ORDER BY name ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sources/:id
 */
const getSourceById = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sources WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sumber tidak ditemukan' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/sources
 */
const createSource = async (req, res, next) => {
  try {
    const { name, type = 'url', url = null, description = null } = req.body;
    const [result] = await pool.query(
      'INSERT INTO sources (name, type, url, description) VALUES (?, ?, ?, ?)',
      [name, type, url, description]
    );
    await refreshWebScope();
    await recordAudit(req, { action: 'source.create', entity: 'source', entityId: result.insertId, detail: { name: req.body?.name, url: req.body?.url } });

    res.status(201).json({
      success: true,
      message: 'Sumber berhasil dibuat',
      data: { id: result.insertId, name, type }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/sources/:id
 */
const updateSource = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [existing] = await pool.query('SELECT id FROM sources WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Sumber tidak ditemukan' });
    }

    const { name, type, url, description } = req.body;
    await pool.query(
      'UPDATE sources SET name = ?, type = ?, url = ?, description = ? WHERE id = ?',
      [name, type, url, description, id]
    );
    await refreshWebScope();
    await recordAudit(req, { action: 'source.update', entity: 'source', entityId: req.params.id });
    res.json({ success: true, message: 'Sumber berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/sources/:id
 */
const deleteSource = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM sources WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Sumber tidak ditemukan' });
    }
    await refreshWebScope();
    await recordAudit(req, { action: 'source.delete', entity: 'source', entityId: req.params.id });
    res.json({ success: true, message: 'Sumber berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSources, getSourceById, createSource, updateSource, deleteSource };
