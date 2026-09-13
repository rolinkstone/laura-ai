const { pool } = require('../config/db');
const { ask: askAI, askStream: askAIStream } = require('../services/ai/ai.service');

/**
 * Chat publik (tanpa login).
 * Sesi tamu dibuat dengan user_id NULL dan diingat lewat session_id
 * yang disimpan di localStorage browser pengunjung.
 */

/**
 * Buat / pakai ulang sesi tamu.
 * @returns {Promise<number>} sessionId
 */
const resolveGuestSession = async (sessionId) => {
  if (sessionId) {
    const [s] = await pool.query('SELECT id FROM chat_sessions WHERE id = ? AND user_id IS NULL', [sessionId]);
    if (s.length === 0) {
      const err = new Error('Sesi tidak ditemukan');
      err.status = 404;
      throw err;
    }
    return s[0].id;
  }
  const [result] = await pool.query(
    'INSERT INTO chat_sessions (user_id, title) VALUES (NULL, ?)',
    ['Percakapan baru']
  );
  return result.insertId;
};

const persistGuestChat = async ({ sessionId, question, answer, sources, modelUsed, durationMs }) => {
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
       VALUES (NULL, ?, ?, ?, 0, ?, 'success')`,
      [modelUsed, question, answer, durationMs]
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
 * POST /api/public/chat  (non-streaming, tamu)
 */
const ask = async (req, res, next) => {
  try {
    const { question, session_id = null, category_id = null, limit } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: 'Pertanyaan (question) wajib diisi' });
    }

    const sessionId = await resolveGuestSession(session_id);
    const startedAt = Date.now();
    const result = await askAI({ question: String(question).trim(), limit, categoryId: category_id });

    await persistGuestChat({
      sessionId,
      question: String(question).trim(),
      answer: result.answer,
      sources: result.sources,
      modelUsed: result.modelUsed,
      durationMs: Date.now() - startedAt
    });

    res.json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        // Sitasi bernomor [n] + status pemakaian tiap sumber (pipeline AI Agent)
        citations: result.citations || [],
        route: result.agent?.route || null,
        session_id: sessionId,
        model: result.modelUsed
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/public/chat/stream  (SSE, tamu)
 */
const stream = async (req, res) => {
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

    const sessionId = await resolveGuestSession(session_id);
    const startedAt = Date.now();
    let fullAnswer = '';
    let sources = [];
    let citations = [];
    let modelUsed = '';

    for await (const evt of askAIStream({ question: String(question).trim(), limit, categoryId: category_id })) {
      if (evt.type === 'sources') {
        sources = evt.sources;
        send({ type: 'sources', sources });
      } else if (evt.type === 'plan') {
        // Tahap perencanaan AI Agent (routing RAG/Web) — opsional untuk UI
        send({ type: 'plan', route: evt.route, queries: evt.queries, reason: evt.reason });
      } else if (evt.type === 'token') {
        fullAnswer += evt.text;
        send({ type: 'token', text: evt.text });
      } else if (evt.type === 'citations') {
        citations = evt.citations;
        send({ type: 'citations', citations });
      } else if (evt.type === 'done') {
        modelUsed = evt.model;
        if (evt.citations) citations = evt.citations;
        send({ type: 'done', model: evt.model, session_id: sessionId, citations });
      }
    }

    await persistGuestChat({
      sessionId,
      question: String(question).trim(),
      answer: fullAnswer,
      sources,
      modelUsed,
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    try {
      send({ type: 'error', message: err.message });
    } catch {
      // response sudah ditutup
    }
  } finally {
    res.end();
  }
};

/**
 * POST /api/public/feedback  (tamu, tanpa login)
 * Body: { message_id?, rating?, comment? }
 */
const feedback = async (req, res, next) => {
  try {
    const { message_id = null, rating = null, comment = null } = req.body;
    const [result] = await pool.query(
      'INSERT INTO feedback (user_id, message_id, rating, comment) VALUES (NULL, ?, ?, ?)',
      [message_id, rating, comment]
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

module.exports = { ask, stream, feedback };
