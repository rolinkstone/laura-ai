/**
 * Uji rantai Keycloak end-to-end di backend:
 *   client_credentials → access token → verifyToken (JWKS) → syncKeycloakUser
 *
 * ⚠️ Tidak menampilkan token/secret. Hanya ringkasan user.
 * Jalankan: node src/scripts/testKeycloak.js
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { verifyToken, isConfigured } = require('../config/keycloak');
const { syncKeycloakUser } = require('../services/keycloakService');

(async () => {
  if (!isConfigured()) {
    console.log('❌ KEYCLOAK_ISSUER belum dikonfigurasi');
    process.exit(1);
  }

  const tokenUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.KEYCLOAK_CLIENT_ID,
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();

  if (!res.ok) {
    console.log(
      'ℹ️ client_credentials ditolak:',
      data.error_description || data.error || `HTTP ${res.status}`
    );
    console.log('   → Kemungkinan client tidak mengaktifkan Service Account.');
    console.log('   → Uji penuh dilakukan via browser SSO (login Keycloak).');
    await pool.end();
    return;
  }

  console.log('✅ Mendapat access token (client_credentials)');

  const kc = await verifyToken(data.access_token);
  console.log('✅ Token terverifikasi via JWKS');
  console.log('   sub                :', kc.sub);
  console.log('   preferred_username :', kc.preferred_username);
  console.log('   realm roles        :', JSON.stringify(kc.realm_access?.roles || []));

  const user = await syncKeycloakUser(kc);
  console.log('✅ User tersinkron ke tabel users');
  console.log('   id       :', user.id);
  console.log('   username :', user.username);
  console.log('   role     :', user.role_name);

  await pool.end();
  console.log('\n🎉 Rantai Keycloak backend berfungsi.');
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
