const express = require('express');
const { search } = require('../controllers/rag.controller');
const { auth } = require('../middlewares/auth');
const { chatLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Cari chunk paling relevan dari pertanyaan (vector search)
router.post('/search', auth, chatLimiter, search);

module.exports = router;
