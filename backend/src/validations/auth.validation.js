const { body } = require('express-validator');

const registerValidation = [
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
  body('nip')
    .optional({ nullable: true })
    .isString().withMessage('NIP harus berupa string'),
  body('role_id')
    .optional()
    .isInt({ min: 1 }).withMessage('role_id harus angka positif')
];

const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username wajib diisi'),
  body('password').notEmpty().withMessage('Password wajib diisi')
];

module.exports = { registerValidation, loginValidation };
