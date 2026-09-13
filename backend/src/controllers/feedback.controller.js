const { pool } = require('../config/db');

/**
 * GET /api/feedback
 * Daftar feedback (admin bisa lihat semua, user biasa hanya miliknya)
 */
const getFeedback = async (req, res, next) => {
  try {
    let sql = `
      SELECT f.id, f.user_id, f.message_id, f.rating, f.comment, f.created_at,
             u.full_name AS user_name,
             cm.content AS message_content
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN chat_messages cm ON f.message_id = cm.id
    `;
    const params = [];

    if (req.user.role_name !== 'admin') {
      sql += ' WHERE f.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY f.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/feedback
 * Berikan feedback terhadap jawaban AI
 */
const createFeedback = async (req, res, next) => {
  try {
    const { message_id = null, rating = null, comment = null } = req.body;

    const [result] = await pool.query(
      'INSERT INTO feedback (user_id, message_id, rating, comment) VALUES (?, ?, ?, ?)',
      [req.user.id, message_id, rating, comment]
    );

    res.status(201).json({
      success: true,
      message: 'Feedback berhasil dikirim',
      data: { id: result.insertId, rating, comment }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getFeedback, createFeedback };
