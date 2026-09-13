const express = require('express');
const {
  getFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq
} = require('../controllers/faq.controller');
const { auth, authorize } = require('../middlewares/auth');

const router = express.Router();

// FAQ publik boleh dilihat tanpa login
router.get('/', getFaqs);
router.get('/:id', getFaqById);

// Management FAQ untuk semua user yang login
router.post('/', auth, authorize('admin', 'analyst', 'viewer'), createFaq);
router.put('/:id', auth, authorize('admin', 'analyst', 'viewer'), updateFaq);
router.delete('/:id', auth, authorize('admin', 'analyst', 'viewer'), deleteFaq);

module.exports = router;
