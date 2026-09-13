const express = require('express');
const {
  getSources,
  getSourceById,
  createSource,
  updateSource,
  deleteSource
} = require('../controllers/source.controller');
const { auth, authorize } = require('../middlewares/auth');

const router = express.Router();

// List source boleh dilihat semua user yang login
router.get('/', auth, getSources);
router.get('/:id', auth, getSourceById);

// Management source untuk semua user yang login
router.post('/', auth, authorize('admin', 'analyst', 'viewer'), createSource);
router.put('/:id', auth, authorize('admin', 'analyst', 'viewer'), updateSource);
router.delete('/:id', auth, authorize('admin', 'analyst', 'viewer'), deleteSource);

module.exports = router;
