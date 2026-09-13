const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { verifyToken, isConfigured } = require('../config/keycloak');
const { syncKeycloakUser } = require('../services/keycloakService');

const signToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

/**
 * POST /api/auth/register
 * Mendaftarkan user baru (role default: viewer/id 2)
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password, full_name, nip = null, role_id = 2 } = req.body;

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Username atau email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (username, email, password, full_name, nip, role_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, full_name, nip, role_id]
    );

    const [roleRows] = await pool.query('SELECT name FROM roles WHERE id = ?', [role_id]);
    const role_name = roleRows.length ? roleRows[0].name : 'viewer';

    const token = signToken({ id: result.insertId, username, role_name });

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      data: { id: result.insertId, username, email, full_name, nip, role_id, role_name },
      token
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.password, u.full_name, u.nip,
              u.role_id, u.is_active, r.name AS role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = ?`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const user = rows[0];
    if (user.is_active !== 1) {
      return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const token = signToken(user);

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        nip: user.nip,
        role_id: user.role_id,
        role_name: user.role_name
      },
      token
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/keycloak
 * Login via Keycloak SSO: terima access token Keycloak,
 * verifikasi → sinkronisasi user lokal → kembalikan JWT aplikasi.
 */
const keycloakLogin = async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'Keycloak belum dikonfigurasi di backend' });
    }

    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token Keycloak wajib dikirim' });
    }

    const kc = await verifyToken(token);
    const user = await syncKeycloakUser(kc);
    const appToken = signToken(user);

    res.json({
      success: true,
      message: 'Login Keycloak berhasil',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role_id: user.role_id,
        role_name: user.role_name,
        auth_provider: 'keycloak'
      },
      token: appToken
    });
  } catch (err) {
    if (err.message === 'KEYCLOAK_ISSUER belum dikonfigurasi di .env') {
      return res.status(503).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Profile user yang sedang login
 */
const getProfile = async (req, res, next) => {
  try {
    res.json({ success: true, data: req.user });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, keycloakLogin, getProfile };
