const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { verifyToken, isConfigured } = require('../config/keycloak');
const { syncKeycloakUser } = require('../services/keycloakService');

const loadUserById = async (id) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.nip, u.role_id, u.is_active,
            r.name AS role_name
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Middleware autentikasi.
 * 1) Memverifikasi JWT aplikasi (JWT_SECRET).
 * 2) Fallback: jika Keycloak dikonfigurasi, verifikasi access token Keycloak
 *    lalu sinkronisasi user lokal (RBAC tetap berfungsi).
 */
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan. Silakan login.' });
    }

    const token = header.split(' ')[1];

    // 1) Token aplikasi (JWT lokal)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await loadUserById(decoded.id);
      if (user && user.is_active === 1) {
        req.user = user;
        return next();
      }
      return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan atau tidak ditemukan' });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token aplikasi sudah kedaluwarsa. Silakan login ulang.' });
      }
      // Token lokal tidak valid → lanjut coba Keycloak
    }

    // 2) Token Keycloak (SSO)
    if (isConfigured()) {
      try {
        const kc = await verifyToken(token);
        const user = await syncKeycloakUser(kc);
        req.user = { ...user, auth_provider: 'keycloak' };
        return next();
      } catch (kcErr) {
        return res.status(401).json({ success: false, message: 'Token tidak valid' });
      }
    }

    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
};

/**
 * Middleware otorisasi berdasarkan role.
 * Contoh: authorize('admin') atau authorize('admin', 'analyst')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role_name)) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses ke resource ini'
      });
    }
    next();
  };
};

module.exports = { auth, authorize };
