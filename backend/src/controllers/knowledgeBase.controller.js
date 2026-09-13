const { pool } = require('../config/db');

/**
 * Membangun tree kategori dari daftar flat.
 * @param {Array} categories hasil query (dengan field id, name, description, parent_id, document_count)
 * @param {number|null} parentId
 * @returns {Array} tree bersarang
 */
const buildTree = (categories, parentId = null) => {
  return categories
    .filter((c) => {
      if (parentId === null) return c.parent_id === null;
      return c.parent_id === parentId;
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      parent_id: c.parent_id,
      document_count: c.document_count,
      children: buildTree(categories, c.id)
    }));
};

/**
 * GET /api/knowledge-base
 * Mengembalikan seluruh tree Knowledge Base (kategori bertingkat + jumlah dokumen)
 */
const getTree = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT dc.id, dc.name, dc.description, dc.parent_id,
             COUNT(d.id) AS document_count
      FROM document_categories dc
      LEFT JOIN documents d ON d.category_id = dc.id
      GROUP BY dc.id, dc.name, dc.description, dc.parent_id
      ORDER BY dc.id ASC
    `);

    res.json({ success: true, data: buildTree(rows) });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/knowledge-base/:id
 * Detail kategori: sub-kategori, dokumen, dan FAQ terkait
 */
const getCategoryDetail = async (req, res, next) => {
  try {
    const id = req.params.id;

    const [cats] = await pool.query(
      `SELECT dc.id, dc.name, dc.description, dc.parent_id,
              COUNT(d.id) AS document_count
       FROM document_categories dc
       LEFT JOIN documents d ON d.category_id = dc.id
       WHERE dc.id = ?
       GROUP BY dc.id, dc.name, dc.description, dc.parent_id`,
      [id]
    );

    if (cats.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }

    const category = cats[0];

    // Sub-kategori (anak langsung)
    const [children] = await pool.query(
      `SELECT id, name, description,
              (SELECT COUNT(*) FROM documents d WHERE d.category_id = document_categories.id) AS document_count
       FROM document_categories
       WHERE parent_id = ?
       ORDER BY id ASC`,
      [id]
    );

    // Dokumen dalam kategori ini
    const [documents] = await pool.query(
      `SELECT id, title, description, file_path, file_type, status, created_at
       FROM documents
       WHERE category_id = ?
       ORDER BY created_at DESC`,
      [id]
    );

    // FAQ yang kategorinya sesuai nama kategori
    const [faqs] = await pool.query(
      'SELECT id, question, answer, category FROM faq WHERE category = ? AND is_active = 1 ORDER BY id ASC',
      [category.name]
    );

    res.json({
      success: true,
      data: {
        ...category,
        children,
        documents,
        faqs
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTree, getCategoryDetail };
