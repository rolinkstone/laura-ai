const express = require('express');
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/category.controller');
const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { auth, authorize } = require('../middlewares/auth');

const router = express.Router();

const categoryValidation = [
  body('name').trim().notEmpty().withMessage('Nama kategori wajib diisi').isLength({ max: 100 }),
  body('description').optional({ nullable: true }).isString(),
  body('parent_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('parent_id tidak valid')
];

const idParam = [param('id').isInt({ min: 1 }).withMessage('ID tidak valid')];

// List kategori untuk semua user login
router.get('/', auth, getCategories);

// Management kategori untuk semua user yang login
router.post('/', auth, authorize('admin', 'analyst', 'viewer'), categoryValidation, validate, createCategory);
router.put('/:id', auth, authorize('admin', 'analyst', 'viewer'), idParam, validate, categoryValidation, validate, updateCategory);
router.delete('/:id', auth, authorize('admin', 'analyst', 'viewer'), idParam, validate, deleteCategory);

module.exports = router;
