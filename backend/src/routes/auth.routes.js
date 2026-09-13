const express = require('express');
const { register, login, keycloakLogin, getProfile } = require('../controllers/auth.controller');
const { registerValidation, loginValidation } = require('../validations/auth.validation');
const validate = require('../middlewares/validate');
const { auth } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');
const { body } = require('express-validator');

const router = express.Router();

router.post('/register', authLimiter, registerValidation, validate, register);
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
