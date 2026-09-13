const { Pool, types } = require('pg');

/**
 * Koneksi database PostgreSQL menggunakan node-postgres (`pg`).
 *
 * Catatan migrasi MySQL → PostgreSQL:
 *  - Driver diganti dari mysql2 → pg.
 *  - Modul ini menyediakan lapisan tipis yang kompatibel dengan pemanggilan
 *    mysql2 agar perubahan di controller/script minimal dan aman:
 *      • placeholder `?` diterjemahkan otomatis menjadi `$1, $2, ...`
 *      • hasil query dikembalikan sebagai [rows, fields] (bisa di-destructure)
 *      • `insertId` & `affectedRows` diisi dari RETURNING / rowCount
 *      • `pool.getConnection()` + beginTransaction/commit/rollback dipetakan
 *        ke client pg (BEGIN/COMMIT/ROLLBACK)
 *  Seluruh sintaks SQL spesifik MySQL (JSON_SET, ON DUPLICATE KEY, backtick,
 *  ENGINE=InnoDB, AUTO_INCREMENT, TINYINT(1), ON UPDATE CURRENT_TIMESTAMP)
 *  sudah dialihkan ke sintaks PostgreSQL (lihat schema.pg.sql).
 */

// ---- Type parser: tiru perilaku mysql2 (dateStrings: true) ----
// DATE/TIMESTAMP dikembalikan sebagai string, bukan objek Date.
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1184, (v) => v); // timestamptz
// bigint (COUNT, id BIGINT) -> number agar konsisten dengan JS
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bbpom_ai',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Simpan referensi query asli pg SEBELUM pool.query di-override
const nativePoolQuery = pool.query.bind(pool);

const isInsert = (sql) => /^\s*insert\b/i.test(sql);
const isWrite = (sql) => /^\s*(insert|update|delete)\b/i.test(sql);

/**
 * Terjemahkan placeholder `?` (gaya mysql2) menjadi `$1, $2, ...` (gaya pg),
 * dengan tetap melewati string literal, identifier ber-quote, dan komentar.
 * Mendukung ekspansi array (mysql2: `IN (?)` dengan parameter array).
 */
const toPg = (text, params) => {
  if (!params || params.length === 0) {
    return { text, values: [] };
  }
  let out = '';
  let i = 0;
  let p = 0;
  let ph = 0;
  const values = [];
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    // String literal '...' (dukung '' sebagai escape)
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += text.slice(i, Math.min(j, len));
      i = j;
      continue;
    }

    // Identifier "..." atau `...`
    if (ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < len) {
        if (text[j] === ch) {
          if (text[j + 1] === ch) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += text.slice(i, Math.min(j, len));
      i = j;
      continue;
    }

    // Komentar baris --
    if (ch === '-' && text[i + 1] === '-') {
      let j = i;
      while (j < len && text[j] !== '\n') {
        out += text[j];
        j += 1;
      }
      i = j;
      continue;
    }

    // Komentar blok /* */
    if (ch === '/' && text[i + 1] === '*') {
      out += '/*';
      i += 2;
      while (i < len) {
        out += text[i];
        if (text[i] === '*' && text[i + 1] === '/') {
          out += '/';
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Placeholder ?
    if (ch === '?') {
      if (p >= params.length) {
        throw new Error(`Jumlah placeholder (?) melebihi jumlah parameter (${params.length})`);
      }
      const val = params[p++];
      if (Array.isArray(val)) {
        // Ekspansi untuk IN (?) — perilaku mysql2
        const placeholders = val.map(() => `$${++ph}`);
        out += placeholders.join(', ');
        values.push(...val);
      } else {
        out += `$${++ph}`;
        values.push(val);
      }
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return { text: out, values };
};

/**
 * Eksekusi query & kembalikan hasil bergaya mysql2: [rows, fields].
 * Untuk INSERT otomatis menambahkan `RETURNING id` agar `insertId` tersedia.
 */
const runQuery = async (executor, sql, params) => {
  const prepared = toPg(sql, params);
  let finalSql = prepared.text;
  if (isInsert(finalSql) && !/\breturning\b/i.test(finalSql)) {
    finalSql = `${finalSql} RETURNING id`;
  }
  const res = await executor(finalSql, prepared.values);

  const rows = res.rows;
  if (isWrite(sql)) {
    rows.insertId = rows[0] && rows[0].id != null ? rows[0].id : 0;
    rows.affectedRows = res.rowCount;
  }
  return [rows, res.fields];
};

// Lapisan kompatibilitas untuk client transaksi (getConnection)
const wrapClient = (client) => {
  let released = false;
  const nativeClientQuery = client.query.bind(client);
  return {
    query: (sql, params) => runQuery(nativeClientQuery, sql, params),
    beginTransaction: async () => {
      await client.query('BEGIN');
    },
    commit: async () => {
      await client.query('COMMIT');
    },
    rollback: async () => {
      await client.query('ROLLBACK');
    },
    ping: async () => {
      await client.query('SELECT 1');
    },
    release: () => {
      if (released) return;
      released = true;
      client.release();
    }
  };
};

pool.getConnection = async () => wrapClient(await pool.connect());
pool.query = (sql, params) => runQuery(nativePoolQuery, sql, params);

/**
 * Uji koneksi ke database PostgreSQL.
 * @returns {Promise<boolean>} true jika berhasil terhubung
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Koneksi ke database PostgreSQL berhasil terhubung');
    console.log(`   Host : ${process.env.DB_HOST || 'localhost'}:${Number(process.env.DB_PORT) || 5432}`);
    console.log(`   DB   : ${process.env.DB_NAME || 'bbpom_ai'}`);
    return true;
  } catch (err) {
    console.error('❌ Gagal terhubung ke database:', err.message);
    return false;
  }
};

module.exports = { pool, testConnection, toPg };
