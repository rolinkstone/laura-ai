const { pool } = require('../config/db');

/**
 * GET /api/faq
 * Dukungan query ?category=
 */
const getFaqs = async (req, res, next) => {
  try {
    const { category, all } = req.query;
    let sql = 'SELECT * FROM faq WHERE 1=1';
    const params = [];

    if (!all && category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (!all) {
      sql += ' AND is_active = 1';
    }

    sql += ' ORDER BY id ASC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/faq/:id
 */
const getFaqById = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM faq WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'FAQ tidak ditemukan' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/faq
 */
const createFaq = async (req, res, next) => {
  try {
    const { question, answer, category = null } = req.body;
    const [result] = await pool.query(
      'INSERT INTO faq (question, answer, category) VALUES (?, ?, ?)',
      [question, answer, category]
    );
    res.status(201).json({
      success: true,
      message: 'FAQ berhasil dibuat',
      data: { id: result.insertId, question, category }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/faq/:id
 */
const updateFaq = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [existing] = await pool.query('SELECT id FROM faq WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'FAQ tidak ditemukan' });
    }

    const { question, answer, category, is_active } = req.body;
    await pool.query(
      'UPDATE faq SET question = ?, answer = ?, category = ?, is_active = ? WHERE id = ?',
      [question, answer, category, is_active, id]
    );
    res.json({ success: true, message: 'FAQ berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/faq/:id
 */
const deleteFaq = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM faq WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'FAQ tidak ditemukan' });
    }
    res.json({ success: true, message: 'FAQ berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getFaqs, getFaqById, createFaq, updateFaq, deleteFaq };
