const { pool } = require('../config/db');
const { ask: askAI, askStream: askAIStream } = require('../services/ai/ai.service');

/**
 * Simpan pesan (user + asisten) & log AI ke database.
 */
const persistChatResult = async ({ userId, sessionId, question, answer, sources, modelUsed, tokensUsed, durationMs }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO chat_messages (session_id, "role", content) VALUES (?, ?, ?)',
      [sessionId, 'user', question]
    );

    await conn.query(
      'INSERT INTO chat_messages (session_id, "role", content, sources) VALUES (?, ?, ?, ?)',
      [sessionId, 'assistant', answer, JSON.stringify(sources)]
    );

    await conn.query(
      `INSERT INTO ai_logs (user_id, model, prompt, response, tokens_used, duration_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, modelUsed, question, answer, tokensUsed, durationMs, 'success']
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Jalankan pipeline RAG lalu simpan pesan & log AI ke database.
 */
const runRagAndPersist = async ({ userId, sessionId, question, categoryId, limit }) => {
  const startedAt = Date.now();
  const result = await askAI({ question, limit, categoryId });
  await persistChatResult({
    userId,
    sessionId,
    question,
    answer: result.answer,
    sources: result.sources,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
    durationMs: Date.now() - startedAt
  });
  return result;
};

/**
 * Resolve atau buat sesi percakapan (dengan cek kepemilikan).
 * @returns {Promise<number>} sessionId
 */
const resolveSession = async (req, sessionIdParam) => {
  let sessionId = sessionIdParam;
  if (sessionId) {
    const [s] = await pool.query('SELECT id, user_id FROM chat_sessions WHERE id = ?', [sessionId]);
    if (s.length === 0) {
      const err = new Error('Sesi tidak ditemukan');
      err.status = 404;
      throw err;
    }
    if (req.user.role_name !== 'admin' && s[0].user_id !== req.user.id) {
      const err = new Error('Anda tidak memiliki akses ke sesi ini');
      err.status = 403;
      throw err;
    }
  } else {
    const [s] = await pool.query(
      'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
      [req.user.id, 'Percakapan baru']
    );
    sessionId = s.insertId;
  }
  return sessionId;
};

/**
 * POST /api/chat
 * Endpoint utama RAG: pertanyaan → embedding → vector search → context → LLM → jawaban + sources
 * Body: { question, session_id?, category_id?, limit? }
 */
const ask = async (req, res, next) => {
  try {
    const { question, session_id = null, category_id = null, limit } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: 'Pertanyaan (question) wajib diisi' });
    }

    const sessionId = await resolveSession(req, session_id);
    const result = await runRagAndPersist({
      userId: req.user.id,
      sessionId,
      question: String(question).trim(),
      categoryId: category_id,
      limit
    });

    res.json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        session_id: sessionId,
        model: result.modelUsed
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/chat/stream
 * Sama seperti /api/chat tetapi jawaban dialirkan via Server-Sent Events (SSE).
 */
const streamChat = async (req, res, next) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const { question, session_id = null, category_id = null, limit } = req.body;

    if (!question || !String(question).trim()) {
      send({ type: 'error', message: 'Pertanyaan (question) wajib diisi' });
      return res.end();
    }

    const sessionId = await resolveSession(req, session_id);
    const startedAt = Date.now();
    let fullAnswer = '';
    let sources = [];
    let modelUsed = '';
    let tokensUsed = 0;

    for await (const evt of askAIStream({ question: String(question).trim(), limit, categoryId: category_id })) {
      if (evt.type === 'sources') {
        sources = evt.sources;
        send({ type: 'sources', sources });
      } else if (evt.type === 'token') {
        fullAnswer += evt.text;
        send({ type: 'token', text: evt.text });
      } else if (evt.type === 'done') {
        modelUsed = evt.model;
        send({ type: 'done', model: evt.model, session_id: sessionId });
      }
    }

    await persistChatResult({
      userId: req.user.id,
      sessionId,
      question: String(question).trim(),
      answer: fullAnswer,
      sources,
      modelUsed,
      tokensUsed,
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    try {
      send({ type: 'error', message: err.message });
    } catch {
      // response mungkin sudah ditutup
    }
  } finally {
    res.end();
  }
};

/**
 * GET /api/chat/sessions
 * Daftar sesi percakapan user (role admin bisa lihat semua)
 */
const getSessions = async (req, res, next) => {
  try {
    let sql = `
      SELECT cs.id, cs.title, cs.status, cs.created_at, cs.updated_at,
             u.full_name AS user_name,
             (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) AS message_count
      FROM chat_sessions cs
      LEFT JOIN users u ON cs.user_id = u.id
    `;
    const params = [];

    if (req.user.role_name !== 'admin') {
      sql += ' WHERE cs.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY cs.updated_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/chat/sessions
 * Membuat sesi percakapan baru
 */
const createSession = async (req, res, next) => {
  try {
    const { title = 'Percakapan baru' } = req.body;
    const [result] = await pool.query(
      'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
      [req.user.id, title]
    );
    res.status(201).json({
      success: true,
      message: 'Sesi percakapan dibuat',
      data: { id: result.insertId, title, status: 'active' }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/chat/sessions/:id
 * Detail sesi beserta seluruh pesan
 */
const getSessionMessages = async (req, res, next) => {
  try {
    const id = req.params.id;

    const [session] = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [id]
    );
    if (session.length === 0) {
      return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
    }

    // Cek kepemilikan (kecuali admin)
    if (req.user.role_name !== 'admin' && session[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke sesi ini' });
    }

    const [messages] = await pool.query(
      'SELECT id, "role", content, sources, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC',
      [id]
    );

    res.json({ success: true, data: { session: session[0], messages } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/chat/sessions/:id/messages
 * Kirim pesan ke asisten dalam sesi yang sudah ada (menggunakan RAG engine).
 */
const sendMessage = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { content, category_id = null } = req.body;

    const [session] = await pool.query('SELECT * FROM chat_sessions WHERE id = ?', [id]);
    if (session.length === 0) {
      return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
    }
    if (req.user.role_name !== 'admin' && session[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke sesi ini' });
    }

    // Update judul sesi otomatis jika masih default
    if (session[0].title === 'Percakapan baru') {
      const shortTitle = content.length > 60 ? `${content.slice(0, 60)}...` : content;
      await pool.query('UPDATE chat_sessions SET title = ? WHERE id = ?', [shortTitle, id]);
    }

    const result = await runRagAndPersist({
      userId: req.user.id,
      sessionId: Number(id),
      question: content,
      categoryId: category_id
    });

    res.status(201).json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        model: result.modelUsed
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/chat/sessions/:id
 */
const deleteSession = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [session] = await pool.query('SELECT user_id FROM chat_sessions WHERE id = ?', [id]);
    if (session.length === 0) {
      return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
    }
    if (req.user.role_name !== 'admin' && session[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke sesi ini' });
    }

    await pool.query('DELETE FROM chat_sessions WHERE id = ?', [id]);
    res.json({ success: true, message: 'Sesi berhasil dihapus' });
  } catch (err) {
    next(err);
  }
};

module.exports = { ask, streamChat, getSessions, createSession, getSessionMessages, sendMessage, deleteSession };
