const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { getClientId } = require('../config/keycloak');

/**
 * Pemetaan role Keycloak → role lokal.
 * super_admin/admin → admin; operator/analyst → analyst; default → viewer
 * @param {string[]} realmRoles
 * @returns {string} nama role lokal
 */
const mapRole = (realmRoles = []) => {
  const r = realmRoles.map((x) => x.toLowerCase());
  if (r.includes('super_admin') || r.includes('admin')) return 'admin';
  if (r.includes('operator') || r.includes('analyst') || r.includes('petugas')) return 'analyst';
  return 'viewer';
};

/**
 * Sinkronisasi user Keycloak ke tabel users lokal.
 * - Upsert berdasarkan username (preferred_username)
 * - Password diisi hash acak (login tetap via Keycloak, bukan password)
 * @param {object} kc klaim token Keycloak
 * @returns {Promise<object>} user lokal (id, username, email, full_name, role_id, role_name, is_active)
 */
const syncKeycloakUser = async (kc) => {
  const username = kc.preferred_username || kc.sub;
  const email = kc.email || null;
  const fullName = kc.name || kc.preferred_username || username;
  const roleName = mapRole(kc.realm_access?.roles);

  // Cari role lokal sesuai pemetaan. Bila belum ada, pakai role dengan hak
  // akses paling rendah yang tersedia. Kalau tabel `roles` benar-benar kosong,
  // beri pesan yang jelas — bukan error foreign key yang membingungkan.
  const [roleRows] = await pool.query('SELECT id, name FROM roles WHERE name = ?', [roleName]);
  let roleId = roleRows[0]?.id;
  let roleNameUsed = roleRows[0]?.name || roleName;

  if (!roleId) {
    const [fallback] = await pool.query(
      `SELECT id, name FROM roles
        ORDER BY CASE name WHEN 'viewer' THEN 1 WHEN 'analyst' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END
        LIMIT 1`
    );
    if (!fallback[0]) {
      throw new Error(
        'Tabel "roles" kosong. Jalankan `npm run seed` di container backend lebih dulu.'
      );
    }
    roleId = fallback[0].id;
    roleNameUsed = fallback[0].name;
  }

  const [existing] = await pool.query(
    'SELECT id, username, email, full_name, role_id, is_active FROM users WHERE username = ?',
    [username]
  );

  if (existing.length > 0) {
    await pool.query(
      'UPDATE users SET email = COALESCE(?, email), full_name = ?, role_id = ?, is_active = 1, last_login = NOW() WHERE id = ?',
      [email, fullName, roleId, existing[0].id]
    );
    return {
      id: existing[0].id,
      username,
      email,
      full_name: fullName,
      role_id: roleId,
      role_name: roleNameUsed,
      is_active: 1
    };
  }

  // Password placeholder: hash acak agar tidak bisa login via password
  const dummyHash = await bcrypt.hash(`${Math.random()}-${Date.now()}`, 10);

  const [result] = await pool.query(
    'INSERT INTO users (username, email, password, full_name, role_id) VALUES (?, ?, ?, ?, ?)',
    [username, email, dummyHash, fullName, roleId]
  );

  return {
    id: result.insertId,
    username,
    email,
    full_name: fullName,
    role_id: roleId,
    role_name: roleNameUsed,
    is_active: 1
  };
};

/**
 * Kumpulkan role Keycloak user (realm + client) untuk logging/audit.
 */
const getKeycloakRoles = (kc) => {
  const clientRoles = kc.resource_access?.[getClientId()]?.roles || [];
  return {
    realm: kc.realm_access?.roles || [],
    client: clientRoles
  };
};

module.exports = { syncKeycloakUser, mapRole, getKeycloakRoles };
