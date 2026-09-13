const { validationResult } = require('express-validator');

/**
 * Middleware untuk mengeksekusi hasil validasi express-validator.
 * Dipasang SETELAH rule validasi pada sebuah route.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validasi gagal',
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg
      }))
    });
  }
  next();
};

module.exports = validate;
