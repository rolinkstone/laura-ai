const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { UPLOAD_DIR } = require('../config/multer');
const { extractPages } = require('../services/pdfService');
const { chunkPages, cleanText } = require('../services/textProcessor');
const { embedBatch, MODEL } = require('../services/embeddingService');
const { fetchUrlContent, getHostname } = require('../services/webScraper');

const DOCUMENT_SELECT = `
  SELECT d.id, d.title, d.description, d.category_id, d.source_id,
         d.file_path, d.file_type, d.uploaded_by,
         d.document_date, d.effective_date, d.status, d.is_active, d.metadata,
         d.created_at, d.updated_at,
         dc.name AS category_name,
         s.name AS source_name,
         u.full_name AS uploaded_by_name
  FROM documents d
  LEFT JOIN document_categories dc ON d.category_id = dc.id
  LEFT JOIN sources s ON d.source_id = s.id
  LEFT JOIN users u ON d.uploaded_by = u.id
`;

/**
 * GET /api/documents
 * Dukungan query ?category_id= & ?status=
 */
const getDocuments = async (req, res, next) => {
  try {
    const { category_id, status } = req.query;
    let sql = `${DOCUMENT_SELECT} WHERE 1=1`;
    const params = [];

    if (category_id) {
      sql += ' AND d.category_id = ?';
      params.push(category_id);
    }
    if (status) {
      sql += ' AND d.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY d.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/:id
 */
const getDocumentById = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${DOCUMENT_SELECT} WHERE d.id = ?`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/documents
 */
const createDocument = async (req, res, next) => {
  try {
    const {
      title, description = null, category_id = null, source_id = null,
      file_path = null, file_type = null, status = 'draft', metadata = null
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO documents (title, description, category_id, source_id, file_path, file_type, uploaded_by, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, category_id, source_id, file_path, file_type, req.user.id, status,
       metadata ? JSON.stringify(metadata) : null]
    );

    res.status(201).json({
      success: true,
      message: 'Dokumen berhasil dibuat',
      data: { id: result.insertId, title, status }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/documents/:id
 */
const updateDocument = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [existing] = await pool.query('SELECT id FROM documents WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }

    const { title, description, category_id, source_id, file_path, file_type, status, is_active, metadata } = req.body;

    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (category_id !== undefined) { fields.push('category_id = ?'); values.push(category_id); }
    if (source_id !== undefined) { fields.push('source_id = ?'); values.push(source_id); }
    if (file_path !== undefined) { fields.push('file_path = ?'); values.push(file_path); }
    if (file_type !== undefined) { fields.push('file_type = ?'); values.push(file_type); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }
    if (metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(metadata)); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah' });
    }

    values.push(id);
    await pool.query(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'Dokumen berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/documents/:id
 */
const deleteDocument = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }
    res.json({ success: true, message: 'Dokumen berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/:id/chunks
 * Daftar potongan teks (chunks) dari dokumen
 */
const getDocumentChunks = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, chunk_index, content, page_number, section, metadata FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/documents/:id/chunks
 * Menambah chunk teks ke dokumen
 */
const addDocumentChunk = async (req, res, next) => {
  try {
    const { content, chunk_index, page_number = null, section = null, embedding = null, metadata = null } = req.body;
    const [result] = await pool.query(
      `INSERT INTO document_chunks
         (document_id, chunk_index, content, page_number, section, embedding, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, chunk_index, content, page_number, section,
       embedding ? JSON.stringify(embedding) : null,
       metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json({
      success: true,
      message: 'Chunk berhasil ditambahkan',
      data: { id: result.insertId }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/documents/upload  (multipart/form-data, field: file)
 * Alur: Upload PDF → simpan file → simpan metadata → ekstrak teks → bersihkan → chunking
 */
const uploadDocument = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    if (!req.file) {
      conn.release();
      return res.status(400).json({ success: false, message: 'File PDF wajib diunggah (field: file)' });
    }

    const {
      title,
      description = null,
      category_id = null,
      source_id = null,
      document_date = null,
      effective_date = null
    } = req.body;

    await conn.beginTransaction();

    // 1) Simpan metadata dokumen (status: processing)
    const [result] = await conn.query(
      `INSERT INTO documents
         (title, description, category_id, source_id, file_path, file_type, uploaded_by, document_date, effective_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')`,
      [title, description, category_id || null, source_id || null,
       req.file.filename, 'pdf', req.user.id, document_date || null, effective_date || null]
    );
    const documentId = result.insertId;

    // 2) PDF → Text (halaman per halaman, sudah dibersihkan)
    const { pages, numPages } = await extractPages(req.file.path);

    if (pages.length === 0) {
      await conn.query("UPDATE documents SET status = 'failed' WHERE id = ?", [documentId]);
      await conn.commit();
      return res.status(422).json({
        success: false,
        message: 'Tidak ada teks yang dapat diekstrak dari PDF (mungkin hasil scan tanpa OCR)',
        data: { id: documentId, status: 'failed' }
      });
    }

    // 3) Pecah menjadi chunk (mempertahankan nomor halaman & section)
    const chunks = chunkPages(pages);

    // 3b) Buat embedding vektor untuk setiap chunk
    const embeddings = await embedBatch(chunks.map((c) => c.content), 'passage: ');

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await conn.query(
        `INSERT INTO document_chunks
           (document_id, chunk_index, content, page_number, section, embedding, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [documentId, c.chunk_index, c.content, c.page, c.section,
         JSON.stringify(embeddings[i]),
         JSON.stringify({ embedding_model: MODEL, page: c.page, section: c.section })]
      );
    }

    // 4) Update status ready + metadata pemrosesan
    const charCount = pages.reduce((sum, p) => sum + p.text.length, 0);
    const meta = {
      numPages,
      charCount,
      chunkCount: chunks.length,
      embeddingModel: MODEL,
      embeddingDim: (embeddings[0] || []).length
    };
    await conn.query(
      `UPDATE documents SET status = 'ready', metadata = ? WHERE id = ?`,
      [JSON.stringify(meta), documentId]
    );

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Dokumen berhasil diunggah dan diproses',
      data: {
        id: documentId,
        title,
        category_id: category_id || null,
        file_path: req.file.filename,
        num_pages: numPages,
        chunk_count: chunks.length,
        status: 'ready'
      }
    });
  } catch (err) {
    if (conn) await conn.rollback();
    // Bersihkan file jika proses gagal
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  } finally {
    if (conn) conn.release();
  }
};

/**
 * GET /api/documents/:id/file
 * Mengunduh file dokumen
 */
const downloadDocument = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, file_path, file_type FROM documents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }

    const doc = rows[0];
    if (!doc.file_path) {
      return res.status(404).json({ success: false, message: 'File dokumen tidak tersedia' });
    }

    const filePath = path.join(UPLOAD_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan di server' });
    }

    const safeTitle = doc.title.replace(/[\\/:*?"<>|]/g, '_');
    res.download(filePath, `${safeTitle}.${doc.file_type || 'pdf'}`);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/documents/:id/reprocess
 * Proses ulang PDF: ekstraksi teks → chunking → embedding (hapus chunk lama).
 */
const reprocessDocument = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT id, title, file_path FROM documents WHERE id = ?', [id]);
    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }

    const doc = rows[0];
    const filePath = path.join(UPLOAD_DIR, doc.file_path || '');
    if (!doc.file_path || !fs.existsSync(filePath)) {
      conn.release();
      return res.status(404).json({ success: false, message: 'File dokumen tidak tersedia' });
    }

    await conn.beginTransaction();
    await conn.query("UPDATE documents SET status = 'processing' WHERE id = ?", [id]);

    const { pages, numPages } = await extractPages(filePath);
    const chunks = chunkPages(pages);

    if (chunks.length === 0) {
      await conn.query("UPDATE documents SET status = 'failed' WHERE id = ?", [id]);
      await conn.commit();
      conn.release();
      return res.status(422).json({ success: false, message: 'Tidak ada teks yang dapat diekstrak (mungkin hasil scan tanpa OCR)' });
    }

    const embeddings = await embedBatch(chunks.map((c) => c.content), 'passage: ');

    await conn.query('DELETE FROM document_chunks WHERE document_id = ?', [id]);

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await conn.query(
        `INSERT INTO document_chunks
           (document_id, chunk_index, content, page_number, section, embedding, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, c.chunk_index, c.content, c.page, c.section,
         JSON.stringify(embeddings[i]),
         JSON.stringify({ embedding_model: MODEL, page: c.page, section: c.section })]
      );
    }

    const charCount = pages.reduce((sum, p) => sum + p.text.length, 0);
    const meta = {
      numPages,
      charCount,
      chunkCount: chunks.length,
      embeddingModel: MODEL,
      embeddingDim: (embeddings[0] || []).length
    };
    await conn.query(
      `UPDATE documents SET status = 'ready', metadata = ? WHERE id = ?`,
      [JSON.stringify(meta), id]
    );

    await conn.commit();
    res.json({
      success: true,
      message: 'Dokumen berhasil di-proses ulang',
      data: { id, status: 'ready', chunk_count: chunks.length, num_pages: numPages }
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
};

/**
 * POST /api/documents/:id/reembed
 * Buat ulang embedding untuk chunk yang sudah ada (tanpa re-chunk).
 */
const reembedDocument = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT id, metadata FROM documents WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }

    const [chunks] = await pool.query(
      'SELECT id, content, metadata FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC',
      [id]
    );
    if (chunks.length === 0) {
      return res.status(400).json({ success: false, message: 'Dokumen belum punya chunk. Jalankan re-process dulu.' });
    }

    const embeddings = await embedBatch(chunks.map((c) => c.content), 'passage: ');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < chunks.length; i++) {
        const chunkMeta = { ...(chunks[i].metadata || {}), embedding_model: MODEL };
        await conn.query(
          'UPDATE document_chunks SET embedding = ?, metadata = ? WHERE id = ?',
          [JSON.stringify(embeddings[i]), JSON.stringify(chunkMeta), chunks[i].id]
        );
      }
      const docMeta = {
        ...(rows[0].metadata || {}),
        embeddingModel: MODEL,
        embeddingDim: (embeddings[0] || []).length
      };
      await conn.query(
        'UPDATE documents SET metadata = ? WHERE id = ?',
        [JSON.stringify(docMeta), id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({
      success: true,
      message: `Embedding diperbarui untuk ${chunks.length} chunk`,
      data: { id, chunk_count: chunks.length, model: MODEL }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/documents/from-url
 * Tambah dokumen dari URL (HTML atau PDF):
 *   buka URL → ambil teks → chunking → embedding → document_chunks
 * Body: { url, title?, description?, category_id?, source_id? }
 */
const createDocumentFromUrl = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { url, title = null, description = null, category_id = null, source_id = null } = req.body;

    // 1) Ambil konten URL (HTML atau PDF)
    const content = await fetchUrlContent(url);

    await conn.beginTransaction();

    // 2) Buat sumber otomatis bila tidak ada source_id
    let resolvedSourceId = source_id;
    if (!resolvedSourceId) {
      const hostname = getHostname(url);
      const [src] = await conn.query(
        'INSERT INTO sources (name, type, url, description) VALUES (?, ?, ?, ?)',
        [title || hostname, 'url', url, description || 'Dibuat otomatis dari URL']
      );
      resolvedSourceId = src.insertId;
    }

    // 3) Simpan dokumen (file_path menyimpan URL)
    const docTitle = title || content.pageTitle || getHostname(url);
    const [result] = await conn.query(
      `INSERT INTO documents (title, description, category_id, source_id, file_path, file_type, uploaded_by, status)
       VALUES (?, ?, ?, ?, ?, 'url', ?, 'processing')`,
      [docTitle, description, category_id || null, resolvedSourceId, url, req.user.id]
    );
    const documentId = result.insertId;

    // 4) Ekstraksi teks: PDF → halaman; HTML → 1 halaman
    let pages;
    if (content.type === 'pdf') {
      const tmpFile = path.join(UPLOAD_DIR, `url-${Date.now()}.pdf`);
      fs.writeFileSync(tmpFile, content.buffer);
      try {
        pages = await extractPages(tmpFile);
      } finally {
        fs.unlink(tmpFile, () => {});
      }
    } else {
      pages = [{ page: 1, text: cleanText(content.text) }];
    }

    if (pages.length === 0) {
      await conn.query("UPDATE documents SET status = 'failed' WHERE id = ?", [documentId]);
      await conn.commit();
      return res.status(422).json({ success: false, message: 'Tidak ada teks yang dapat diekstrak dari URL' });
    }

    // 5) Chunking + embedding
    const chunks = chunkPages(pages);
    const embeddings = await embedBatch(chunks.map((c) => c.content), 'passage: ');

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await conn.query(
        `INSERT INTO document_chunks
           (document_id, chunk_index, content, page_number, section, embedding, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [documentId, c.chunk_index, c.content, c.page, c.section,
         JSON.stringify(embeddings[i]),
         JSON.stringify({ embedding_model: MODEL, page: c.page, section: c.section, source: 'url' })]
      );
    }

    const charCount = pages.reduce((sum, p) => sum + p.text.length, 0);
    const meta = {
      numPages: pages.length,
      charCount,
      chunkCount: chunks.length,
      embeddingModel: MODEL,
      embeddingDim: (embeddings[0] || []).length,
      sourceType: 'url',
      url
    };
    await conn.query(
      `UPDATE documents SET status = 'ready', metadata = ? WHERE id = ?`,
      [JSON.stringify(meta), documentId]
    );

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Konten URL berhasil diproses',
      data: { id: documentId, title: docTitle, url, chunk_count: chunks.length, status: 'ready' }
    });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentChunks,
  addDocumentChunk,
  uploadDocument,
  downloadDocument,
  reprocessDocument,
  reembedDocument,
  createDocumentFromUrl
};
