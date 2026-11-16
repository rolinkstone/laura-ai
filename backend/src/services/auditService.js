const { pool } = require('../config/db');

/**
 * Jejak audit tindakan penting (CRUD dokumen, perubahan config, dsb).
 *
 * Kenapa: `ai_logs` hanya mencatat panggilan AI. Tanpa tabel ini, aksi seperti
 * menghapus dokumen atau mengganti API key tidak meninggalkan jejak siapa
 * pelakunya.
 *
 * Prinsip:
 *  - Penulisan TIDAK PERNAH boleh menggagalkan aksi utama. Semua error ditelan
 *    dan hanya di-log ke konsol (audit tidak boleh jadi titik gagal request).
 *  - `detail` disimpan sebagai JSONB; JANGAN pernah menaruh secret (API key,
 *    password, token) di dalamnya.
 */

/**
 * Ambil identitas pelaku dari request.
 * @param {object} req express request
 */
const actorFromReq = (req) => ({
  userId: req.user?.id || null,
  actor: req.user?.username || null,
  role: req.user?.role_name || null,
  ip: req.ip || null
});

/**
 * Tulis satu entri audit.
 * @param {object} req request express (untuk identitas pelaku & IP)
 * @param {{action: string, entity?: string, entityId?: (string|number|null), detail?: object}} data
 * @returns {Promise<boolean>} true bila tersimpan
 */
const recordAudit = async (req, { action, entity = null, entityId = null, detail = null } = {}) => {
  if (!action) return false;
  const who = actorFromReq(req);
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, actor, role, action, entity, entity_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        who.userId,
        who.actor,
        who.role,
        String(action).slice(0, 80),
        entity ? String(entity).slice(0, 50) : null,
        entityId === null || entityId === undefined ? null : String(entityId).slice(0, 64),
        detail ? JSON.stringify(detail) : null,
        who.ip
      ]
    );
    return true;
  } catch (err) {
    // Jangan pernah menggagalkan request karena audit gagal.
    console.warn(`[AUDIT] gagal mencatat "${action}": ${err.message}`);
    return false;
  }
};

/**
 * Daftar entri audit terbaru untuk halaman admin.
 * @param {{limit?: number, beforeId?: number, action?: string, entity?: string}} opsi
 */
const listAudit = async ({ limit = 50, beforeId = null, action = null, entity = null } = {}) => {
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = [];
  const params = [];

  if (beforeId) {
    where.push('id < ?');
    params.push(Number(beforeId));
  }
  if (action) {
    where.push('action = ?');
    params.push(String(action));
  }
  if (entity) {
    where.push('entity = ?');
    params.push(String(entity));
  }

  const sql = `
    SELECT id, user_id, actor, role, action, entity, entity_id, detail, ip, created_at
      FROM audit_logs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY id DESC
     LIMIT ${max}
  `;
  const [rows] = await pool.query(sql, params);
  return rows;
};

module.exports = { recordAudit, listAudit, actorFromReq };
