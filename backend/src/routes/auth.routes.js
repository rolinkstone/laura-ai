const express = require('express');
const { register, login, keycloakLogin, getProfile } = require('../controllers/auth.controller');
const { registerValidation, loginValidation } = require('../validations/auth.validation');
const validate = require('../middlewares/validate');
const { auth } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');
const { body } = require('express-validator');

const router = express.Router();

/**
 * Registrasi mandiri lewat API.
 *
 * KEAMANAN: endpoint ini menerima `role_id` dari body, jadi siapa pun bisa
 * mendaftarkan diri sebagai admin bila dibiarkan terbuka. Login produksi
 * sepenuhnya lewat Keycloak (lihat seed.js & keycloakService.js), maka endpoint
 * ini NONAKTIF kecuali ALLOW_REGISTER=true di .env — dan bila aktif wajib
 * menyertakan header x-register-key yang cocok dengan REGISTER_KEY.
 * Pengelolaan user normal memakai /api/users (khusus admin).
 */
const registerGuard = (req, res, next) => {
  if (process.env.ALLOW_REGISTER !== 'true') {
    return res.status(404).json({ success: false, message: 'Route tidak ditemukan' });
  }
  const key = process.env.REGISTER_KEY;
  if (!key || req.headers['x-register-key'] !== key) {
    return res.status(403).json({ success: false, message: 'Registrasi mandiri tidak diizinkan' });
  }
  next();
};

router.post('/register', registerGuard, authLimiter, registerValidation, validate, register);
router.post('/login', authLimiter, loginValidation, validate, login);
router.post(
  '/keycloak',
  authLimiter,
  body('token').notEmpty().withMessage('Token Keycloak wajib diisi'),
  validate,
  keycloakLogin
);
router.get('/me', auth, getProfile);

module.exports = router;
