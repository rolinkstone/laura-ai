const express = require('express');
const {
  ask,
  streamChat,
  getSessions,
  createSession,
  getSessionMessages,
  sendMessage,
  deleteSession
} = require('../controllers/chat.controller');
const {
  createChatSessionValidation,
  chatAskValidation,
  sendMessageValidation,
  sessionIdParam
} = require('../validations/chat.validation');
const validate = require('../middlewares/validate');
const { auth } = require('../middlewares/auth');
const { chatLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.use(auth);

// Endpoint utama RAG: POST /api/chat
router.post('/', chatLimiter, chatAskValidation, validate, ask);
router.post('/stream', chatLimiter, chatAskValidation, validate, streamChat);

router.get('/sessions', getSessions);
router.post('/sessions', chatLimiter, createChatSessionValidation, validate, createSession);
router.get('/sessions/:id', getSessionMessages);
router.delete('/sessions/:id', deleteSession);
router.post('/sessions/:id/messages', chatLimiter, sendMessageValidation, validate, sendMessage);

module.exports = router;
