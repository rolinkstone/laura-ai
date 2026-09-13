/**
 * Middleware 404 - route tidak ditemukan
 */
const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route tidak ditemukan: ${req.method} ${req.originalUrl}`
  });
};

/**
 * Error handler terpusat
 */
const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err);

  // Duplicate entry (PostgreSQL: unique_violation 23505, dulunya MySQL ER_DUP_ENTRY)
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Data sudah ada / duplikat'
    });
  }

  // Foreign key constraint (PostgreSQL: foreign_key_violation 23503)
  if (err.code === '23503') {
    return res.status(409).json({
      success: false,
      message: 'Data sedang digunakan oleh data lain atau referensi tidak valid'
    });
  }

  // Check constraint (PostgreSQL: check_violation 23514) — mis. nilai enum/boolean tidak sah
  if (err.code === '23514') {
    return res.status(422).json({
      success: false,
      message: 'Nilai tidak valid untuk data tersebut'
    });
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
};

module.exports = { notFound, errorHandler };
