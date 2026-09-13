const { pool } = require('../config/db');

/**
 * GET /api/roles
 */
const getRoles = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM roles ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/roles/:id
 */
const getRoleById = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Role tidak ditemukan' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/roles
 */
const createRole = async (req, res, next) => {
  try {
    const { name, description = null } = req.body;
    const [result] = await pool.query(
      'INSERT INTO roles (name, description) VALUES (?, ?)',
      [name, description]
    );
    res.status(201).json({
      success: true,
      message: 'Role berhasil dibuat',
      data: { id: result.insertId, name, description }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/roles/:id
 */
const updateRole = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const id = req.params.id;

    const [existing] = await pool.query('SELECT id FROM roles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Role tidak ditemukan' });
    }

    await pool.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id]);
    res.json({ success: true, message: 'Role berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/roles/:id
 */
const deleteRole = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Role tidak ditemukan' });
    }
    res.json({ success: true, message: 'Role berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRoles, getRoleById, createRole, updateRole, deleteRole };
