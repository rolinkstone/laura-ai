const { body, param } = require('express-validator');

const createUserValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username wajib diisi')
    .isLength({ min: 3, max: 50 }).withMessage('Username minimal 3 karakter'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email wajib diisi')
    .isEmail().withMessage('Format email tidak valid'),
  body('password')
    .notEmpty().withMessage('Password wajib diisi')
    .isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
  body('full_name')
    .trim()
    .notEmpty().withMessage('Nama lengkap wajib diisi')
    .isLength({ max: 100 }).withMessage('Nama lengkap maksimal 100 karakter'),
  body('nip').optional({ nullable: true }).isString().withMessage('NIP harus berupa string'),
  body('role_id').isInt({ min: 1 }).withMessage('role_id harus angka positif')
];

const updateUserValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID user tidak valid'),
  body('full_name').optional().trim().isLength({ max: 100 }).withMessage('Nama lengkap maksimal 100 karakter'),
  body('email').optional().trim().isEmail().withMessage('Format email tidak valid'),
  body('nip').optional({ nullable: true }).isString().withMessage('NIP harus berupa string'),
  body('role_id').optional().isInt({ min: 1 }).withMessage('role_id harus angka positif'),
  body('is_active').optional().isIn([0, 1]).withMessage('is_active harus 0 atau 1')
];

const userIdParam = [
  param('id').isInt({ min: 1 }).withMessage('ID user tidak valid')
];

module.exports = { createUserValidation, updateUserValidation, userIdParam };
