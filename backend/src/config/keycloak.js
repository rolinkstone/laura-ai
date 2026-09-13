const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

/**
 * Konfigurasi & verifikasi token Keycloak (RS256).
 * Keycloak public key diambil dari JWKS endpoint realm, di-cache.
 */

const getIssuer = () => process.env.KEYCLOAK_ISSUER || null;
const getClientId = () => process.env.KEYCLOAK_CLIENT_ID || 'laura-ai';

const isConfigured = () => !!getIssuer();

let cachedClient = null;

const getJwksClient = () => {
  if (!cachedClient) {
    cachedClient = jwksClient({
      jwksUri: `${getIssuer()}/protocol/openid-connect/certs`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }
  return cachedClient;
};

const getSigningKey = (header) =>
  new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.publicKey || key.rsaPublicKey);
    });
  });

/**
 * Verifikasi access token Keycloak.
 * @param {string} token
 * @returns {Promise<object>} klaim token (sub, preferred_username, email, realm_access, dst)
 */
const verifyToken = async (token) => {
  if (!isConfigured()) {
    throw new Error('KEYCLOAK_ISSUER belum dikonfigurasi di .env');
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header) {
    throw new Error('Token Keycloak tidak valid');
  }

  const signingKey = await getSigningKey(decoded.header);
  const payload = jwt.verify(token, signingKey, {
    issuer: getIssuer(),
    algorithms: ['RS256']
  });

  // Validasi audience (client) bila ada
  const aud = payload.aud;
  if (aud) {
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (!audiences.includes('account') && !audiences.includes(getClientId())) {
      throw new Error('Audience token tidak sesuai dengan client Keycloak');
    }
  }

  return payload;
};

module.exports = { verifyToken, isConfigured, getIssuer, getClientId };
