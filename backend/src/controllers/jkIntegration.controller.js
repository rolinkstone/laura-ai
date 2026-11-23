const { pool } = require('../config/db');
const { recordAudit } = require('../services/auditService');
const {
  issueToken,
  tokenStatus,
  syncEndpoint,
  syncAll,
  getJkBaseUrl,
  setSetting,
  statusBearerJk
} = require('../services/jkIntegrationService');

/**
 * Controller admin — Integrasi Jendela Kinerja.
 * Mengelola tabel `jk_api_endpoint` (daftar API JK yang masuk ke knowledge),
 * penerbitan token + masa berlakunya, dan pemicu sinkronisasi.
 */

const serialize = (ep) => ({
  id: ep.id,
  kode: ep.kode,
  nama: ep.nama,
  url_path: ep.url_path,
  metode: ep.metode,
  auth_mode: ep.auth_mode,
  parameter: ep.parameter || {},
  field_ekspor: ep.field_ekspor,
  kategori_kb: ep.kategori_kb,
  model_data: ep.model_data,
  aktif: ep.aktif === 1,
  urutan: ep.urutan,
  token: tokenStatus(ep),
  token_masa_berlaku_hari: ep.token_masa_berlaku_hari,
  token_terbit_pada: ep.token_terbit_pada,
  tersinkron_pada: ep.tersinkron_pada,
  tersinkron_status: ep.tersinkron_status,
  tersinkron_pesan: ep.tersinkron_pesan,
  dokumen_id: ep.dokumen_id,
  jumlah_baris: ep.jumlah_baris,
  created_at: ep.created_at,
  updated_at: ep.updated_at
});

/** GET /api/integrations/jk — daftar endpoint API JK */
const listEndpoints = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jk_api_endpoint ORDER BY urutan ASC, id ASC');
    const baseUrl = await getJkBaseUrl();
    res.json({
      success: true,
      data: {
        base_url: baseUrl,
        total: rows.length,
        endpoints: rows.map(serialize)
      }
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/integrations/jk/:id — detail satu endpoint + riwayat sinkron */
const getEndpoint = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jk_api_endpoint WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });

    const [logs] = await pool.query(
      'SELECT * FROM jk_sync_log WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    );
    res.json({ success: true, data: { ...serialize(rows[0]), riwayat: logs } });
  } catch (err) {
    next(err);
  }
};

/** POST /api/integrations/jk — tambah endpoint API */
const createEndpoint = async (req, res, next) => {
  try {
    const {
      kode, nama, url_path, metode = 'GET', auth_mode = 'public',
      parameter = {}, field_ekspor = null, kategori_kb = 'Jendela Kinerja',
      model_data = 'ringkasan', aktif = 1, urutan = 0, token_masa_berlaku_hari = 30
    } = req.body;

    if (!kode || !nama || !url_path) {
      return res.status(400).json({ success: false, message: 'kode, nama, dan url_path wajib diisi' });
    }

    const [result] = await pool.query(
      `INSERT INTO jk_api_endpoint
         (kode, nama, url_path, metode, auth_mode, parameter, field_ekspor, kategori_kb, model_data, aktif, urutan, token_masa_berlaku_hari)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [kode, nama, url_path, metode, auth_mode, JSON.stringify(parameter),
       field_ekspor ? JSON.stringify(field_ekspor) : null, kategori_kb, model_data,
       aktif ? 1 : 0, urutan, token_masa_berlaku_hari]
    );

    await recordAudit(req, {
      action: 'jk.endpoint.create',
      entity: 'jk_api_endpoint',
      entityId: result.insertId,
      detail: { kode, nama, url_path }
    });

    res.status(201).json({ success: true, message: 'Endpoint JK ditambahkan', data: { id: result.insertId } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Kode endpoint sudah dipakai' });
    }
    next(err);
  }
};

/**
 * Pecah satu URL tempelan menjadi { baseUrl, url_path, parameter }.
 * Menerima URL lengkap (http://host:port/api/...) maupun path relatif saja.
 */
const uraikanLink = (link, baseFallback) => {
  const teks = String(link || '').trim();
  if (!teks) throw new Error('link kosong');

  // Tanpa skema → anggap path relatif terhadap base yang sudah tersimpan.
  const lengkap = /^https?:\/\//i.test(teks) ? teks : `${baseFallback}${teks.startsWith('/') ? '' : '/'}${teks}`;
  let u;
  try {
    u = new URL(lengkap);
  } catch {
    throw new Error(`link tidak valid: ${teks}`);
  }

  const parameter = {};
  for (const [k, v] of u.searchParams.entries()) parameter[k] = v;

  return { baseUrl: `${u.protocol}//${u.host}`, url_path: u.pathname, parameter };
};

/** Tebak kode/nama/model_data dari path API JK (dipakai saat impor massal). */
const tebakMetadata = (urlPath, parameter) => {
  const bagian = urlPath.split('/').filter(Boolean);
  const akhir = bagian.pop() || 'endpoint';
  const tahun = parameter.tahun || '';

  // --- Endpoint publik Jendela Kinerja: punya perakit khusus ---
  if (urlPath.includes('/publik/kinerja/')) {
    const petaModel = {
      ringkasan: 'ringkasan',
      pilihan: 'pilihan',
      sarana: 'daftar_sarana',
      sampel: 'rekap_sampel'
    };
    const petaNama = {
      ringkasan: `Rekap Kinerja Pengawasan${tahun ? ` ${tahun}` : ''}`,
      pilihan: 'Pilihan Filter & Data Terakhir Diunggah',
      sarana: `Daftar Sarana Diperiksa${tahun ? ` ${tahun}` : ''}`,
      sampel: 'Rekap Sampel Lab (Publik)'
    };
    return {
      kode: `JK-${akhir.toUpperCase()}${tahun ? `-${tahun}` : ''}`,
      nama: petaNama[akhir] || `API ${akhir}`,
      model_data: petaModel[akhir] || 'generik',
      // /api/publik/* seluruhnya publik — tidak ada yang butuh token.
      auth_mode: 'public',
      kategori: 'Jendela Kinerja'
    };
  }

  // --- Endpoint modul (mis. /api/sampel-ot/summary, /api/pbf/laporan) ---
  // Pola: /api/<segmen-modul>/<aksi>
  const segmen = bagian.pop() || 'modul';
  const aksi = akhir;
  // Prefix kode diberi pembeda agar tidak tabrakan antara modul dan sampel:
  //   /api/sampel-ot/*  → SAMPEL-OT-*
  //   /api/produksi-ot/* → PROD-OT-*
  const awalan = segmen.startsWith('sampel-')
    ? `SAMPEL-${segmen.replace(/^sampel-/, '').toUpperCase()}`
    : segmen.startsWith('produksi-')
      ? `PROD-${segmen.replace(/^produksi-/, '').toUpperCase()}`
      : segmen.toUpperCase().replace(/-/g, '');

  const petaAksi = {
    summary: { sufiks: 'SUMMARY', nama: 'Ringkasan' },
    laporan: { sufiks: 'LAPORAN', nama: 'Daftar Laporan' },
    sampel: { sufiks: 'DAFTAR', nama: 'Daftar Sampel' }
  };
  const a = petaAksi[aksi] || { sufiks: aksi.toUpperCase(), nama: `Data ${aksi}` };

  const labelModul = segmen
    .replace(/^sampel-/, 'Sampel ')
    .replace(/^produksi-/, 'Produksi ')
    .replace(/-/g, ' ')
    .toUpperCase();

  // Label kategori yang enak dibaca: "sampel-ot" → "Sampel OT", "pbf" → "PBF".
  const kategori = segmen
    .split('-')
    .map((s) => (s.length <= 3 && s !== 'sampel' && s !== 'produksi'
      ? s.toUpperCase()
      : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(' ');

  // Endpoint BACA modul (mis. /api/pbf/laporan, /api/sampel-ot/sampel) kini
  // PUBLIK: backend JK membuka GET/HEAD tanpa token (server.js →
  // publicBacaRoutes) dan membuang kolom pribadi lewat lib/saring-publik.js.
  // Impor/ubah/hapus tetap wajib token, tapi itu bukan endpoint yang dipakai
  // integrasi ini. Karena itu default-nya 'public' — LAURA tidak perlu
  // menyimpan Bearer Keycloak hanya untuk menarik data rekap.
  return {
    kode: `${awalan}-${a.sufiks}`,
    nama: `${a.nama} ${labelModul}`.trim(),
    model_data: 'generik',
    auth_mode: 'public',
    kategori
  };
};

/**
 * POST /api/integrations/jk/impor — impor MASSAL link dari dashboard JK.
 * Body: { links: ["https://host/api/publik/kinerja/ringkasan?tahun=2026", ...],
 *         base_url?: string, timpa?: boolean }
 * Dedup by kode (turunan path+tahun); `timpa: true` memperbarui yang sudah ada.
 */
const imporLink = async (req, res, next) => {
  try {
    const { links = [], base_url = null, timpa = false } = req.body || {};
    const daftar = (Array.isArray(links) ? links : [links]).map((l) => String(l || '').trim()).filter(Boolean);

    if (!daftar.length) {
      return res.status(400).json({ success: false, message: 'Tidak ada link yang ditempel' });
    }

    const baseFallback = (base_url || (await getJkBaseUrl())).replace(/\/+$/, '');

    // Simpan base URL bila operator mengisinya eksplisit
    if (base_url) {
      await pool.query(
        `INSERT INTO settings (setting_key, setting_value) VALUES ('jk_base_url', ?)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
        [base_url.replace(/\/+$/, '')]
      );
    }

    const hasil = [];
    let urutan = 100;

    for (const link of daftar) {
      try {
        const { baseUrl, url_path, parameter } = uraikanLink(link, baseFallback);
        const { kode, nama, model_data, auth_mode, kategori } = tebakMetadata(url_path, parameter);

        const masa = auth_mode === 'bearer' ? 7 : 30;
        urutan += 10;

        const [ada] = await pool.query('SELECT id FROM jk_api_endpoint WHERE kode = ?', [kode]);

        if (ada.length) {
          if (timpa) {
            await pool.query(
              `UPDATE jk_api_endpoint
                  SET nama = ?, url_path = ?, parameter = ?, model_data = ?,
                      auth_mode = ?, token_masa_berlaku_hari = ?, kategori_kb = ?,
                      updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
              [nama, url_path, JSON.stringify(parameter), model_data, auth_mode, masa, kategori, ada[0].id]
            );
            hasil.push({ kode, status: 'diperbarui', id: ada[0].id, url_path });
          } else {
            hasil.push({ kode, status: 'dilewati', alasan: 'kode sudah ada', id: ada[0].id });
          }
        } else {
          const [ins] = await pool.query(
            `INSERT INTO jk_api_endpoint
               (kode, nama, url_path, auth_mode, parameter, kategori_kb, model_data, urutan, token_masa_berlaku_hari)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [kode, nama, url_path, auth_mode, JSON.stringify(parameter), kategori, model_data, urutan, masa]
          );
          hasil.push({ kode, status: 'ditambahkan', id: ins.insertId, url_path });
        }

        // Pakai host dari link terakhir yang berhasil diurai sebagai base URL
        await pool.query(
          `INSERT INTO settings (setting_key, setting_value) VALUES ('jk_base_url', ?)
           ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
          [baseUrl]
        );
      } catch (e) {
        hasil.push({ link, status: 'gagal', alasan: e.message });
      }
    }

    const ditambahkan = hasil.filter((h) => h.status === 'ditambahkan').length;
    const diperbarui = hasil.filter((h) => h.status === 'diperbarui').length;
    const gagal = hasil.filter((h) => h.status === 'gagal').length;

    await recordAudit(req, {
      action: 'jk.endpoint.impor',
      entity: 'jk_api_endpoint',
      detail: { total: daftar.length, ditambahkan, diperbarui, gagal }
    });

    res.json({
      success: true,
      message: `Impor selesai: ${ditambahkan} baru, ${diperbarui} diperbarui, ${daftar.length - ditambahkan - diperbarui - gagal} dilewati, ${gagal} gagal`,
      data: { hasil, ditambahkan, diperbarui, gagal }
    });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/integrations/jk/:id */
const updateEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM jk_api_endpoint WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });

    const ep = rows[0];
    const {
      kode = ep.kode, nama = ep.nama, url_path = ep.url_path, metode = ep.metode,
      auth_mode = ep.auth_mode, parameter = ep.parameter, field_ekspor = ep.field_ekspor,
      kategori_kb = ep.kategori_kb, model_data = ep.model_data,
      aktif = ep.aktif, urutan = ep.urutan,
      token_masa_berlaku_hari = ep.token_masa_berlaku_hari
    } = req.body;

    await pool.query(
      `UPDATE jk_api_endpoint SET
         kode = ?, nama = ?, url_path = ?, metode = ?, auth_mode = ?, parameter = ?,
         field_ekspor = ?, kategori_kb = ?, model_data = ?, aktif = ?, urutan = ?,
         token_masa_berlaku_hari = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [kode, nama, url_path, metode, auth_mode, JSON.stringify(parameter),
       field_ekspor ? JSON.stringify(field_ekspor) : null, kategori_kb, model_data,
       aktif === true || aktif === 1 ? 1 : 0, urutan, token_masa_berlaku_hari, id]
    );

    await recordAudit(req, {
      action: 'jk.endpoint.update',
      entity: 'jk_api_endpoint',
      entityId: Number(id),
      detail: { kode, nama }
    });

    res.json({ success: true, message: 'Endpoint JK diperbarui' });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/integrations/jk/:id */
const deleteEndpoint = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT kode, dokumen_id FROM jk_api_endpoint WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });

    await pool.query('DELETE FROM jk_api_endpoint WHERE id = ?', [req.params.id]);

    await recordAudit(req, {
      action: 'jk.endpoint.delete',
      entity: 'jk_api_endpoint',
      entityId: Number(req.params.id),
      detail: { kode: rows[0].kode }
    });

    res.json({ success: true, message: 'Endpoint JK dihapus' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/integrations/jk/:id/sync — tarik data satu endpoint ke knowledge */
const syncOne = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jk_api_endpoint WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });

    const hasil = await syncEndpoint(rows[0], {
      dipicuOleh: req.user?.username || req.user?.email || 'admin'
    });

    await recordAudit(req, {
      action: 'jk.sync.one',
      entity: 'jk_api_endpoint',
      entityId: Number(req.params.id),
      detail: hasil
    });

    res.status(hasil.ok ? 200 : 502).json({
      success: hasil.ok,
      message: hasil.ok ? `Sinkron sukses: ${hasil.chunk_count} chunk` : `Sinkron gagal: ${hasil.error}`,
      data: hasil
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/integrations/jk/sync-all — sinkron semua endpoint aktif */
const syncMany = async (req, res, next) => {
  try {
    // Sinkronisasi penuh bisa memakan waktu (embedding tiap chunk) → kirim
    // respons setelah selesai; jumlah endpoint kecil sehingga masih wajar.
    const hasil = await syncAll({ dipicuOleh: req.user?.username || req.user?.email || 'admin' });
    const sukses = hasil.filter((h) => h.ok).length;

    await recordAudit(req, {
      action: 'jk.sync.all',
      entity: 'jk_api_endpoint',
      detail: { total: hasil.length, sukses }
    });

    res.json({
      success: sukses > 0,
      message: `Sinkronisasi selesai: ${sukses}/${hasil.length} endpoint sukses`,
      data: hasil
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/integrations/jk/:id/token — terbitkan token baru (plaintext sekali) */
const issueEndpointToken = async (req, res, next) => {
  try {
    const { masa_berlaku_hari } = req.body || {};
    const hasil = await issueToken(Number(req.params.id), masa_berlaku_hari || null);

    await recordAudit(req, {
      action: 'jk.token.issue',
      entity: 'jk_api_endpoint',
      entityId: Number(req.params.id),
      detail: { masa_berlaku_hari: hasil.masa_berlaku_hari, kedaluwarsa_pada: hasil.kedaluwarsa_pada }
    });

    res.json({
      success: true,
      message: 'Token diterbitkan — simpan sekarang, tidak akan ditampilkan lagi',
      data: hasil
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/integrations/jk/:id/token — cabut token */
const revokeEndpointToken = async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE jk_api_endpoint SET token_hash = NULL, token_terbit_pada = NULL, token_kedaluwarsa_pada = NULL WHERE id = ?',
      [req.params.id]
    );
    await recordAudit(req, {
      action: 'jk.token.revoke',
      entity: 'jk_api_endpoint',
      entityId: Number(req.params.id)
    });
    res.json({ success: true, message: 'Token dicabut' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/integrations/jk/bearer — status token Keycloak JK (bukan isinya).
 * PUT /api/integrations/jk/bearer — simpan token Keycloak JK.
 *
 * Token ini WAJIB ada agar endpoint modul JK (yang dijaga keycloakAuth) bisa
 * disinkron. Disimpan di settings `jk_bearer_token`, hanya admin LAURA yang
 * bisa membacanya lewat service (tidak pernah dikembalikan ke klien).
 */
const getBearer = async (req, res, next) => {
  try {
    res.json({ success: true, data: await statusBearerJk() });
  } catch (err) {
    next(err);
  }
};

const setBearer = async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (token.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Token keycloak tidak valid (terlalu pendek)'
      });
    }
    await setSetting('jk_bearer_token', token);
    await recordAudit(req, {
      action: 'jk.bearer.set',
      entity: 'settings',
      entityId: null,
      detail: { panjang: token.length }
    });
    res.json({ success: true, message: 'Token Keycloak tersimpan', data: await statusBearerJk() });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listEndpoints,
  getEndpoint,
  createEndpoint,
  imporLink,
  updateEndpoint,
  deleteEndpoint,
  syncOne,
  syncMany,
  issueEndpointToken,
  revokeEndpointToken,
  getBearer,
  setBearer
};
