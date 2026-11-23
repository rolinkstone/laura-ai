const crypto = require('crypto');
const { pool } = require('../config/db');
const { embedBatch, MODEL } = require('./embeddingService');
const { chunkPages } = require('./textProcessor');

/**
 * Service integrasi Jendela Kinerja (JK) → Knowledge Laura AI.
 *
 * Data JK diambil HANYA lewat API (tidak ada akses DB langsung):
 *   GET {JK_BASE_URL}/api/publik/kinerja/<endpoint>
 *
 * Alur sinkronisasi per endpoint:
 *   1. Verifikasi token integrasi (hashed sha256, masa berlaku per endpoint)
 *   2. Fetch JSON dari JK (tanpa / dengan Bearer sesuai auth_mode)
 *   3. Rakit teks knowledge dari payload (perakit per model_data)
 *   4. Chunking + embedding (pipeline sama dengan dokumen PDF/URL)
 *   5. Simpan dokumen `documents` (file_type='jk-api', metadata JK) + chunks
 *
 * Token integrasi: token di-hash sha256 sebelum disimpan; masa berlaku
 * dikelola per endpoint lewat kolom token_masa_berlaku_hari.
 */

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const getSetting = async (key) => {
  const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value ?? null;
};

/** Simpan/timpa satu setting (dipakai untuk jk_base_url & jk_bearer_token). */
const setSetting = async (key, value) =>
  pool.query(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [key, value]
  );

/** Status token Keycloak JK (tanpa membocorkan isinya). */
const statusBearerJk = async () => {
  const token = (await getSetting('jk_bearer_token')) || process.env.JK_BEARER_TOKEN || '';
  if (!token) return { terisi: false, panjang: 0, potongan: null };
  return {
    terisi: true,
    panjang: token.length,
    // Hanya 6 karakter awal — cukup untuk memastikan token yang benar terpasang
    potongan: `${token.slice(0, 6)}…`
  };
};

/** Base URL JK dari settings (override) atau env, fallback produksi. */
const getJkBaseUrl = async () =>
  (await getSetting('jk_base_url')) ||
  process.env.JK_BASE_URL ||
  'https://jendela-kinerja.bbpompky.id';

// ---------------------------------------------------------------------------
// TOKEN INTEGRASI
// ---------------------------------------------------------------------------

/**
 * Menerbitkan token integrasi baru untuk satu endpoint.
 * Token PLAINTEXT hanya muncul sekali di respons — hanya hash yang disimpan.
 */
const issueToken = async (endpointId, masaBerlakuHari = null) => {
  const [[ep]] = await pool.query('SELECT * FROM jk_api_endpoint WHERE id = ?', [endpointId]);
  if (!ep) throw new Error('Endpoint tidak ditemukan');

  const hari = masaBerlakuHari || ep.token_masa_berlaku_hari;
  const token = crypto.randomBytes(32).toString('hex');
  const terbit = new Date();
  const kedaluwarsa = new Date(terbit.getTime() + hari * 24 * 3600 * 1000);

  await pool.query(
    `UPDATE jk_api_endpoint
       SET token_hash = ?, token_terbit_pada = ?, token_kedaluwarsa_pada = ?
     WHERE id = ?`,
    [sha256(token), terbit.toISOString(), kedaluwarsa.toISOString(), endpointId]
  );

  return { token, masa_berlaku_hari: hari, terbit_pada: terbit.toISOString(), kedaluwarsa_pada: kedaluwarsa.toISOString() };
};

/** Status masa berlaku token satu endpoint. */
const tokenStatus = (ep) => {
  if (!ep.token_hash) {
    return { status: 'belum_terbit', kedaluwarsa_pada: null, sisa_hari: null };
  }
  const exp = ep.token_kedaluwarsa_pada ? new Date(ep.token_kedaluwarsa_pada) : null;
  const sisaHari = exp ? Math.round((exp - Date.now()) / (24 * 3600 * 1000) * 10) / 10 : null;
  const status = !exp ? 'tanpa_batas' : exp <= new Date() ? 'kedaluwarsa' : sisaHari <= 3 ? 'segera_kedaluwarsa' : 'aktif';
  return { status, kedaluwarsa_pada: exp ? exp.toISOString() : null, sisa_hari: sisaHari };
};

/** Verifikasi Bearer token terhadap hash + masa berlaku endpoint. */
const verifyEndpointToken = async (kode, token) => {
  const [rows] = await pool.query('SELECT * FROM jk_api_endpoint WHERE kode = ?', [kode]);
  const ep = rows[0];
  if (!ep || !ep.token_hash) return { ok: false, reason: 'token tidak dikenal' };
  if (ep.token_hash !== sha256(token)) return { ok: false, reason: 'token salah' };
  if (ep.token_kedaluwarsa_pada && new Date(ep.token_kedaluwarsa_pada) <= new Date()) {
    return { ok: false, reason: 'token kedaluwarsa' };
  }
  return { ok: true, endpoint: ep };
};

// ---------------------------------------------------------------------------
// PERAKIT TEKS KNOWLEDGE — payload API → teks siap chunk
// ---------------------------------------------------------------------------

const fmt = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('id-ID'));

const perakitRingkasan = (data, param) => {
  const t = data.total || {};
  const lines = [
    `# Rekap Kinerja Pengawasan BBPOM di Palangka Raya`,
    param.tahun ? `Periode: tahun ${param.tahun}` : 'Periode: seluruh tahun',
    '',
    `## Ringkasan Angka`,
    ...Object.entries(t).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${fmt(v)}`),
    '',
    `## Per Kabupaten/Kota`,
    `| Kabupaten/Kota | Sarana | MK | TMK | Sampel Lab |`,
    `|---|---|---|---|---|`,
    ...(data.per_kab_kota || []).map(
      (r) =>
        `| ${r.kab_kota || '-'} | ${fmt(r.total)} | ${fmt(Number(r.produksi_mk || 0) + Number(r.distribusi_mk || 0))} | ${fmt(
          Number(r.produksi_tmk || 0) + Number(r.distribusi_tmk || 0)
        )} | ${fmt(r.sampel_lab)} |`
    ),
    '',
    `## Per Jenis Sarana`,
    ...(data.per_jenis_sarana || []).map((r) => `- ${r.jenis_sarana} (${r.kegiatan}): ${fmt(r.jumlah)}`),
    '',
    `## Per Bulan`,
    ...(data.per_bulan || []).map((r) => `- ${r.nama}: ${fmt(r.jumlah)}`),
    '',
    `## 10 Sarana Terbanyak Diperiksa`,
    ...(data.sarana_terbanyak || []).map((r) => `- ${r.nama}: ${fmt(r.jumlah)}`)
  ];
  return lines.join('\n');
};

const perakitRekapSampel = (data, param) => {
  const t = data.total || {};
  const lines = [
    `# Hasil Pengujian Laboratorium — Rekap Sampel BBPOM di Palangka Raya`,
    param.tahun ? `Periode: tahun ${param.tahun}` : 'Periode: seluruh tahun',
    '',
    `## Total`,
    `- sampel diuji: ${fmt(t.sampel)}`,
    `- memenuhi: ${fmt(t.memenuhi)}`,
    `- tidak memenuhi: ${fmt(t.tidak_memenuhi)}`,
    `- produk unik: ${fmt(t.produk)}`,
    `- produsen: ${fmt(t.produsen)}`,
    `- wilayah (kab/kota): ${fmt(t.wilayah)}`,
    '',
    `## Per Tahun`,
    ...(data.per_tahun || []).map(
      (s) => `- ${s.tahun}: ${fmt(s.sampel)} sampel, memenuhi ${fmt(s.memenuhi)}, tidak memenuhi ${fmt(s.tidak_memenuhi)}`
    ),
    '',
    `## Per Kelompok Komoditas`,
    ...(data.per_komoditas || []).map(
      (g) =>
        `- ${g.komoditi}: ${fmt(g.sampel)} sampel, memenuhi ${fmt(g.memenuhi)}, tidak memenuhi ${fmt(g.tidak_memenuhi)}, produk ${fmt(g.produk)}`
    ),
    '',
    `## Sebaran Bentuk Sediaan`,
    ...(data.per_sediaan || []).map(
      (s) => `- ${s.bentuk_sediaan}: ${fmt(s.sampel)} sampel, memenuhi ${fmt(s.memenuhi)}, tidak memenuhi ${fmt(s.tidak_memenuhi)}`
    )
  ];
  return lines.join('\n');
};

const perakitPilihan = (data) => {
  const lines = [`# Data Tersedia Jendela Kinerja`, ''];
  if (data.terakhir_diunggah) lines.push(`Data terakhir diunggah: ${data.terakhir_diunggah}`);
  if (data.tahun?.length) {
    lines.push('', '## Tahun Tersedia');
    for (const t of data.tahun) lines.push(`- ${t.tahun}: ${fmt(t.jumlah)} baris data`);
  }
  if (data.jenis_sarana?.length) {
    lines.push('', '## Jenis Sarana');
    for (const j of data.jenis_sarana) lines.push(`- ${j.jenis_sarana}: ${fmt(j.jumlah)}`);
  }
  if (data.kab_kota?.length) {
    lines.push('', '## Kabupaten/Kota');
    for (const k of data.kab_kota) lines.push(`- ${k.kab_kota}: ${fmt(k.jumlah)}`);
  }
  return lines.join('\n');
};

const perakitDaftarSarana = (data, param) => {
  const rows = data.data || data.rows || [];
  const lines = [
    `# Daftar Sarana Diperiksa`,
    param.tahun ? `Tahun: ${param.tahun}` : '',
    '',
    `| Nama Sarana | Jenis | Kab/Kota | Kesimpulan |`,
    `|---|---|---|---|`,
    ...rows.map(
      (r) =>
        `| ${r.nama_sarana || r.nama || '-'} | ${r.jenis_sarana || r.sumber_label || '-'} | ${r.kab_kota || '-'} | ${r.kesimpulan_akhir || '-'} |`
    )
  ];
  return lines.filter(Boolean).join('\n');
};

/**
 * PERAKIT SERBAGUNA — payload JSON apa pun → teks knowledge.
 *
 * Dipakai endpoint modul yang belum punya perakit khusus (summary/laporan
 * PBF, produksi OT/IRT, daftar sampel per komoditi). Aturannya:
 *   - objek bersarang → heading "## <kunci>"
 *   - array objek     → tabel markdown (kolom = kunci baris pertama)
 *   - array skalar    → daftar berbutir
 *   - nilai skalar    → "kunci: nilai"
 * Dengan begitu endpoint baru tetap menghasilkan knowledge tanpa perlu kode
 * perakit tambahan.
 */
const judulField = (k) =>
  String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const selTabel = (v) => {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'object') return JSON.stringify(v).replace(/\|/g, '/').slice(0, 80);
  return String(v).replace(/\|/g, '/');
};

const rakitNilai = (nilai, judul, level = 2) => {
  const garis = [];
  const prefix = '#'.repeat(Math.min(level, 6));

  if (Array.isArray(nilai)) {
    if (!nilai.length) return [`${prefix} ${judul}`, '(kosong)'];

    if (typeof nilai[0] === 'object' && nilai[0] !== null) {
      // Kolom dari gabungan kunci beberapa baris awal (tahan baris tak seragam)
      const kolom = [...new Set(nilai.slice(0, 5).flatMap((r) => Object.keys(r)))];
      const head = `| ${kolom.map(judulField).join(' | ')} |`;
      const sep = `|${kolom.map(() => '---').join('|')}|`;
      const baris = nilai.map((r) => `| ${kolom.map((k) => selTabel(r[k])).join(' | ')} |`);
      return [`${prefix} ${judul}`, `Jumlah baris: ${nilai.length}`, '', head, sep, ...baris];
    }
    return [`${prefix} ${judul}`, ...nilai.map((n) => `- ${selTabel(n)}`)];
  }

  if (nilai && typeof nilai === 'object') {
    garis.push(`${prefix} ${judul}`);
    for (const [k, v] of Object.entries(nilai)) {
      if (v !== null && typeof v === 'object') {
        garis.push(...rakitNilai(v, judulField(k), level + 1));
      } else {
        garis.push(`- ${judulField(k)}: ${fmt(v)}`);
      }
    }
    return garis;
  }

  return [`${prefix} ${judul}: ${fmt(nilai)}`];
};

const perakitGenerik = (data, param, konteks = {}) => {
  const garis = [
    `# ${konteks.nama || 'Data Jendela Kinerja'}`,
    konteks.url_path ? `Sumber API: ${konteks.url_path}` : '',
    Object.keys(param || {}).length
      ? `Filter: ${Object.entries(param).map(([k, v]) => `${k}=${v}`).join(', ')}`
      : 'Filter: (tidak ada)',
    ''
  ];

  // Payload modul JK umumnya { rows, total, page, ... } atau objek rekap.
  const isi = data && typeof data === 'object' ? data : { data };

  for (const [k, v] of Object.entries(isi)) {
    garis.push(...rakitNilai(v, judulField(k), 2));
    garis.push('');
  }

  return garis.filter((g) => g !== undefined).join('\n');
};

const PERAKIT = {
  ringkasan: perakitRingkasan,
  pilihan: perakitPilihan,
  daftar_sarana: perakitDaftarSarana,
  rekap_sampel: perakitRekapSampel,
  generik: perakitGenerik
};

// ---------------------------------------------------------------------------
// SINKRONISASI
// ---------------------------------------------------------------------------

/** Fetch satu endpoint JK → JSON. */
const fetchJk = async (ep, baseUrl) => {
  const param = new URLSearchParams();
  for (const [k, v] of Object.entries(ep.parameter || {})) param.set(k, String(v));

  const url = `${baseUrl}${ep.url_path}${param.toString() ? `?${param}` : ''}`;
  const headers = {};
  if (ep.auth_mode === 'bearer') {
    // Endpoint modul JK dijaga `keycloakAuth` (Bearer token Keycloak), BUKAN
    // token integrasi LAURA. Token Keycloak diambil dari settings/env — hanya
    // admin LAURA yang bisa mengisinya lewat menu Integrasi JK.
    const bearer = (await getSetting('jk_bearer_token')) || process.env.JK_BEARER_TOKEN;
    if (!bearer) {
      throw new Error(
        'Bearer token JK belum diisi. Isi "Token Keycloak" di menu Integrasi JK ' +
        '(tersimpan sebagai settings.jk_bearer_token).'
      );
    }
    headers.Authorization = `Bearer ${bearer}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};

/**
 * Sinkronisasi satu endpoint: fetch → rakit → chunk → embed → simpan.
 * @param {object} ep baris jk_api_endpoint
 * @param {object} opts { dipicuOleh }
 */
const syncEndpoint = async (ep, { dipicuOleh = 'manual' } = {}) => {
  const started = Date.now();
  const baseUrl = await getJkBaseUrl();
  let payload;
  let chunkCount = 0;
  let documentId = ep.dokumen_id || null;

  try {
    payload = await fetchJk(ep, baseUrl);

    // 1) Snapshot payload (audit/debug)
    await pool.query(
      'INSERT INTO jk_snapshot (endpoint_id, parameter_kirim, payload) VALUES (?, ?, ?)',
      [ep.id, JSON.stringify(ep.parameter || {}), JSON.stringify(payload)]
    );

    // 2) Rakit teks
    const perakit = PERAKIT[ep.model_data];
    if (!perakit) throw new Error(`model_data tidak dikenal: ${ep.model_data}`);
    const teks = perakit(payload.data || {}, ep.parameter || {}, {
      nama: ep.nama,
      url_path: ep.url_path,
      kode: ep.kode
    });
    if (!teks || teks.length < 20) throw new Error('payload kosong / terlalu kecil');

    // 3) Chunk (satukan jadi satu "halaman" teks panjang → chunkPages memecah)
    const chunks = chunkPages([{ page: 1, text: teks }]);

    // 4) Embedding
    const embeddings = await embedBatch(chunks.map((c) => c.content), 'passage: ');

    // 5) Simpan dokumen + chunks dalam satu transaksi
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Hapus chunk lama bila dokumen sudah ada (refresh)
      if (documentId) {
        await conn.query('DELETE FROM document_chunks WHERE document_id = ?', [documentId]);
      }

      const judul = `JK — ${ep.nama}`;
      if (!documentId) {
        const [doc] = await conn.query(
          `INSERT INTO documents (title, description, file_path, file_type, uploaded_by, status)
           VALUES (?, ?, ?, 'jk-api', NULL, 'processing')`,
          [judul, `Data otomatis dari API Jendela Kinerja (${ep.url_path})`, `jk://endpoint/${ep.kode}`]
        );
        documentId = doc.insertId;
        await conn.query('UPDATE jk_api_endpoint SET dokumen_id = ? WHERE id = ?', [documentId, ep.id]);
      } else {
        await conn.query(
          `UPDATE documents SET title = ?, description = ?, status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [judul, `Data otomatis dari API Jendela Kinerja (${ep.url_path})`, documentId]
        );
      }

      const meta = {
        sumber: 'jendela-kinerja',
        endpoint_kode: ep.kode,
        endpoint_url: ep.url_path,
        parameter: ep.parameter || {},
        embedding_model: MODEL,
        embedding_dim: (embeddings[0] || []).length,
        chunk_count: chunks.length,
        model_data: ep.model_data
      };

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await conn.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content, page_number, section, embedding, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [documentId, c.chunk_index, c.content, c.page, c.section, JSON.stringify(embeddings[i]),
           JSON.stringify({ ...meta, chunk: c.chunk_index })]
        );
      }

      await conn.query(
        `UPDATE documents SET status = 'ready', metadata = ? WHERE id = ?`,
        [JSON.stringify({ ...meta, chunkCount: chunks.length, charCount: teks.length }), documentId]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    chunkCount = chunks.length;
    const durasi = Date.now() - started;

    await pool.query(
      `UPDATE jk_api_endpoint
         SET tersinkron_pada = CURRENT_TIMESTAMP, tersinkron_status = 'sukses',
             tersinkron_pesan = ?, jumlah_baris = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [`${chunkCount} chunk tersimpan`, chunkCount, ep.id]
    );
    await pool.query(
      `INSERT INTO jk_sync_log (endpoint_id, kode, status, http_status, jumlah_baris, chunk_count, durasi_ms, pesan, dipicu_oleh)
       VALUES (?, ?, 'sukses', 200, ?, ?, ?, ?, ?)`,
      [ep.id, ep.kode, chunkCount, chunkCount, durasi, `OK ${chunkCount} chunk`, dipicuOleh]
    );

    return { ok: true, kode: ep.kode, chunk_count: chunkCount, durasi_ms: durasi, document_id: documentId };
  } catch (err) {
    const durasi = Date.now() - started;
    await pool.query(
      `UPDATE jk_api_endpoint
         SET tersinkron_pada = CURRENT_TIMESTAMP, tersinkron_status = 'gagal', tersinkron_pesan = ?
       WHERE id = ?`,
      [String(err.message).slice(0, 500), ep.id]
    );
    await pool.query(
      `INSERT INTO jk_sync_log (endpoint_id, kode, status, http_status, jumlah_baris, chunk_count, durasi_ms, pesan, dipicu_oleh)
       VALUES (?, ?, 'gagal', NULL, 0, 0, ?, ?, ?)`,
      [ep.id, ep.kode, durasi, String(err.message).slice(0, 500), dipicuOleh]
    );
    return { ok: false, kode: ep.kode, error: err.message, durasi_ms: durasi };
  }
};

/** Sinkronkan semua endpoint aktif (urut `urutan`). */
const syncAll = async ({ dipicuOleh = 'manual' } = {}) => {
  const [rows] = await pool.query('SELECT * FROM jk_api_endpoint WHERE aktif = 1 ORDER BY urutan ASC');
  const hasil = [];
  for (const ep of rows) {
    hasil.push(await syncEndpoint(ep, { dipicuOleh }));
  }
  return hasil;
};

module.exports = {
  getJkBaseUrl,
  getSetting,
  setSetting,
  statusBearerJk,
  issueToken,
  tokenStatus,
  verifyEndpointToken,
  syncEndpoint,
  syncAll
};
