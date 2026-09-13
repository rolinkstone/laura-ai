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

  const [role] = await pool.query('SELECT id, name FROM roles WHERE name = ?', [roleName]);
  const roleId = role[0]?.id || 2;

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
      role_name: roleName,
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
    role_name: roleName,
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
