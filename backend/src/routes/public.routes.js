const express = require('express');
const { ask, stream, feedback } = require('../controllers/publicChat.controller');
const { chatLimiter } = require('../middlewares/rateLimiter');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');

const router = express.Router();

const chatAskValidation = [
  body('question').trim().notEmpty().withMessage('Pertanyaan (question) wajib diisi'),
  body('session_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('session_id tidak valid'),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('category_id tidak valid'),
  body('limit').optional({ nullable: true }).isInt({ min: 1, max: 20 }).withMessage('limit harus 1-20')
];

const feedbackValidation = [
  body('message_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('message_id tidak valid'),
  body('rating').optional({ nullable: true }).isInt({ min: 1, max: 5 }).withMessage('Rating harus 1-5'),
  body('comment').optional({ nullable: true }).trim().isLength({ max: 1000 })
];

// Chat publik — TANPA login (chat publik tidak perlu autentikasi)
router.post('/chat', chatLimiter, chatAskValidation, validate, ask);
router.post('/chat/stream', chatLimiter, chatAskValidation, validate, stream);
router.post('/feedback', feedbackValidation, validate, feedback);

module.exports = router;
