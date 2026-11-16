const { pool } = require('../config/db');
const { recordAudit } = require('../services/auditService');

/**
 * GET /api/categories
 * Semua kategori (flat) dengan nama parent
 */
const getCategories = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.description, c.parent_id,
             p.name AS parent_name, c.created_at
      FROM document_categories c
      LEFT JOIN document_categories p ON c.parent_id = p.id
      ORDER BY c.id ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/categories
 */
const createCategory = async (req, res, next) => {
  try {
    const { name, description = null, parent_id = null } = req.body;
    const [result] = await pool.query(
      'INSERT INTO document_categories (name, description, parent_id) VALUES (?, ?, ?)',
      [name, description, parent_id]
    );
    await recordAudit(req, { action: 'category.create', entity: 'category', entityId: result.insertId, detail: { name: req.body?.name } });

    res.status(201).json({
      success: true,
      message: 'Kategori berhasil dibuat',
      data: { id: result.insertId, name, description, parent_id }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/categories/:id
 */
const updateCategory = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [existing] = await pool.query('SELECT id FROM document_categories WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }
    const { name, description, parent_id } = req.body;
    await pool.query(
      'UPDATE document_categories SET name = ?, description = ?, parent_id = ? WHERE id = ?',
      [name, description, parent_id ?? null, id]
    );
    await recordAudit(req, { action: 'category.update', entity: 'category', entityId: req.params.id });
    res.json({ success: true, message: 'Kategori berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/categories/:id
 */
const deleteCategory = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM document_categories WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }
    await recordAudit(req, { action: 'category.delete', entity: 'category', entityId: req.params.id });
    res.json({ success: true, message: 'Kategori berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
