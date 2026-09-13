const express = require('express');
const {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole
} = require('../controllers/role.controller');
const { auth, authorize } = require('../middlewares/auth');

const router = express.Router();

// List role boleh dilihat semua user yang login
router.get('/', auth, getRoles);
router.get('/:id', auth, getRoleById);

// Management role khusus admin
router.post('/', auth, authorize('admin'), createRole);
router.put('/:id', auth, authorize('admin'), updateRole);
router.delete('/:id', auth, authorize('admin'), deleteRole);

module.exports = router;
