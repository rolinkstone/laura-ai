const express = require('express');
const { getTree, getCategoryDetail } = require('../controllers/knowledgeBase.controller');

const router = express.Router();

// Knowledge Base bersifat publik (informasi layanan masyarakat)
router.get('/', getTree);
router.get('/:id', getCategoryDetail);

module.exports = router;
