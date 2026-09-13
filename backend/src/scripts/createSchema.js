/**
 * Script untuk membuat database & tabel PostgreSQL dari sql/schema.pg.sql
 * Jalankan: npm run db:schema
 *
 * Alur:
 *  1) Hubungi server PostgreSQL (DB maintenance `postgres`) →
 *     buat database bila belum ada.
 *  2) Hubungi database target → jalankan setiap statement dari schema.pg.sql.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 5432;
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'bbpom_ai';

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * Pecah skrip SQL menjadi daftar statement dengan aman:
 * memahami string '...', identifier "...", komentar -- dan /* ... */,
 * serta dollar-quoted ($$ ... $$ / $tag$ ... $tag$) untuk fungsi PL/pgSQL.
 */
const splitSql = (sql) => {
  const statements = [];
  let current = '';
  let i = 0;
  const len = sql.length;

  const push = () => {
    const s = current.trim();
    if (s) statements.push(s);
    current = '';
  };

  while (i < len) {
    const ch = sql[i];

    if (ch === "'") {
      current += ch;
      i += 1;
      while (i < len) {
        current += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      current += ch;
      i += 1;
      while (i < len) {
        current += sql[i];
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Dollar-quoted: $tag$ ... $tag$ atau $$ ... $$
    const dollarMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollarMatch) {
      const tag = dollarMatch[0];
      current += tag;
      i += tag.length;
      const endTag = sql.indexOf(tag, i);
      const end = endTag === -1 ? len : endTag + tag.length;
      current += sql.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < len && sql[i] !== '\n') {
        current += sql[i];
        i += 1;
      }
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      current += '/*';
      i += 2;
      while (i < len) {
        current += sql[i];
        if (sql[i] === '*' && sql[i + 1] === '/') {
          current += '/';
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === ';') {
      push();
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }
  push();
  return statements;
};

const run = async () => {
  const schemaPath = path.join(__dirname, '..', '..', 'sql', 'schema.pg.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  let admin = null;
  let db = null;
  try {
    // 1) Pastikan database ada (konek ke DB maintenance `postgres`)
    admin = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: 'postgres'
    });
    await admin.connect();
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE ${quoteIdent(DB_NAME)}`);
      console.log(`✅ Database ${DB_NAME} berhasil dibuat`);
    } else {
      console.log(`ℹ️ Database ${DB_NAME} sudah ada`);
    }
    await admin.end();
    admin = null;

    // 2) Jalankan schema ke database target
    db = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    await db.connect();

    const statements = splitSql(schemaSql);
    for (const stmt of statements) {
      await db.query(stmt);
    }
    console.log(`✅ Skema PostgreSQL berhasil dibuat/divalidasi di ${DB_NAME}`);
    console.log('   Tabel: roles, users, sources, document_categories, documents,');
    console.log('   document_chunks, faq, chat_sessions, chat_messages, ai_logs, feedback, settings');
  } catch (err) {
    console.error('❌ Gagal membuat schema:', err.message);
    process.exitCode = 1;
  } finally {
    if (admin) await admin.end().catch(() => {});
    if (db) await db.end().catch(() => {});
  }
};

run();
