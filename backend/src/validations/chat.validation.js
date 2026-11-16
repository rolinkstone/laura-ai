const { body, param } = require('express-validator');

// Batas panjang pertanyaan. Melindungi biaya token LLM sekaligus mengurangi
// ruang gerak prompt injection (payload panjang & berlapis).
const MAX_QUESTION = 4000;

const createChatSessionValidation = [
  body('title').optional().trim().isLength({ max: 255 }).withMessage('Judul maksimal 255 karakter')
];

const chatAskValidation = [
  body('question')
    .trim()
    .notEmpty().withMessage('Pertanyaan (question) wajib diisi')
    .isLength({ max: MAX_QUESTION }).withMessage(`Pertanyaan maksimal ${MAX_QUESTION} karakter`),
  // '' / 'null' / 'undefined' = belum punya sesi (nilai sisa localStorage) -> buat sesi baru
  body('session_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('session_id tidak valid'),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('category_id tidak valid'),
  body('limit').optional({ nullable: true }).isInt({ min: 1, max: 20 }).withMessage('limit harus 1-20')
];

const sendMessageValidation = [
  body('content')
    .trim()
    .notEmpty().withMessage('Pesan tidak boleh kosong')
    .isLength({ max: MAX_QUESTION }).withMessage(`Pesan maksimal ${MAX_QUESTION} karakter`),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('category_id tidak valid')
];

const sessionIdParam = [
  param('id').isInt({ min: 1 }).withMessage('ID sesi tidak valid')
];

module.exports = { createChatSessionValidation, chatAskValidation, sendMessageValidation, sessionIdParam, MAX_QUESTION };
