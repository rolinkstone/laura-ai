/**
 * NARASI PRESENTASI DASHBOARD "JENDELA KINERJA"
 * ---------------------------------------------
 * Mengubah angka dashboard publik (/jendela-kinerja) menjadi naskah narasi
 * yang dibacakan widget LAURA di halaman JK (TTS browser, ±1 menit).
 *
 * Kenapa ada naskah template + LLM:
 *  - LLM memberi kalimat yang mengalir dan menonjolkan temuan penting.
 *  - Kalau provider AI mati / kuota habis, naskah TETAP terkirim dari angka
 *    nyata (template deterministik). Presentasi tidak boleh gagal hanya karena
 *    LLM tidak tersedia — angka berasal dari payload, bukan karangan.
 *
 * Prinsip: SEMUA angka diambil dari payload dashboard yang dikirim JK. Tidak
 * ada angka yang dihitung ulang di sini, supaya narasi tidak pernah berbeda
 * dengan yang tampil di layar.
 */

const { complete } = require('../services/ai/llmRuntime');

/** Bulan Indonesia untuk narasi. */
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/** Angka gaya Indonesia (4095 → "4.095"). Null/undefined → "0". */
const n = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return '0';
  return x.toLocaleString('id-ID');
};

/** Persen satu desimal, dibulatkan aman (pembagi 0 → null). */
const persen = (bagian, total) => {
  const a = Number(bagian);
  const b = Number(total);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((a / b) * 1000) / 10;
};

/** "September 2026" dari { tahun, bulan } — kosong bila tidak ada. */
const labelPeriode = (tahun, bulan) => {
  const b = Number(bulan);
  if (!tahun) return '';
  if (Number.isFinite(b) && b >= 1 && b <= 12) return `${BULAN[b - 1]} ${tahun}`;
  return `tahun ${tahun}`;
};

/**
 * Normalisasi payload dashboard dari JK.
 * Menerima bentuk ringkas apa pun; field yang tidak ada dibiarkan kosong.
 */
const rapikan = (body = {}) => {
  const d = body.dashboard || body.data || body || {};
  const total = d.total || {};
  const filter = d.filter || {};
  const perKab = Array.isArray(d.per_kab_kota) ? d.per_kab_kota : [];
  const perJenis = Array.isArray(d.per_jenis_sarana) ? d.per_jenis_sarana : [];
  const saranaTerbanyak = Array.isArray(d.sarana_terbanyak) ? d.sarana_terbanyak : [];

  const urutKab = [...perKab].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

  return {
    tahun: filter.tahun || body.tahun || null,
    bulan: filter.bulan || body.bulan || null,
    jenis: filter.jenis || body.jenis || null,
    total,
    perKab: urutKab,
    perJenis: [...perJenis].sort((a, b) => Number(b.jumlah || b.total || 0) - Number(a.jumlah || a.total || 0)),
    saranaTerbanyak,
    jumlahKab: urutKab.length,
  };
};

/**
 * Naskah narasi deterministik (fallback + kerangka untuk LLM).
 * Sengaja ±170 kata ≈ 60 detik pada kecepatan baca TTS normal.
 */
const naskahTemplate = (r) => {
  const t = r.total;
  const periode = labelPeriode(r.tahun, r.bulan);
  const jenis = r.jenis ? ` pada jenis sarana ${r.jenis}` : '';
  const bagian = [];

  bagian.push(
    `Selamat datang di Jendela Kinerja Balai Besar POM di Palangka Raya${periode ? `, periode ${periode}` : ''}.`
  );

  bagian.push(
    `Pada periode ini tercatat ${n(t.sarana_diperiksa)} pemeriksaan sarana${jenis}, ` +
    `terdiri dari ${n(t.distribusi)} sarana distribusi dan ${n(t.produksi)} sarana produksi, ` +
    `mencakup ${n(t.jumlah_jenis_sarana)} jenis sarana di ${n(r.jumlahKab)} kabupaten dan kota.`
  );

  const lulus = persen(t.memenuhi, t.sampel_lab);
  const tidak = persen(t.tidak_memenuhi, t.sampel_lab);
  if (Number(t.sampel_lab) > 0) {
    bagian.push(
      `Dari sisi pengujian laboratorium, ${n(t.sampel_lab)} sampel diperiksa. ` +
      (lulus !== null ? `${n(t.memenuhi)} sampel atau ${lulus} persen memenuhi syarat` : `${n(t.memenuhi)} sampel memenuhi syarat`) +
      (tidak !== null ? `, dan ${n(t.tidak_memenuhi)} sampel atau ${tidak} persen tidak memenuhi syarat.` : '.')
    );
  }

  const temuan = [
    ['kritis', t.temuan_kritis],
    ['mayor', t.temuan_mayor],
    ['minor', t.temuan_minor],
  ].filter(([, v]) => Number(v) > 0);

  if (temuan.length) {
    bagian.push(
      `Temuan pelanggaran terbagi menjadi ${temuan.map(([l, v]) => `${n(v)} temuan ${l}`).join(', ')}.`
    );
  }

  if (r.perKab.length) {
    const atas = r.perKab[0];
    const bawah = r.perKab[r.perKab.length - 1];
    const kedua = r.perKab[1];
    bagian.push(
      `Wilayah dengan cakupan pengawasan tertinggi adalah ${atas.kab_kota} dengan ${n(atas.total)} pemeriksaan` +
      (kedua ? `, disusul ${kedua.kab_kota} dengan ${n(kedua.total)} pemeriksaan` : '') +
      `, sedangkan cakupan terendah ada di ${bawah.kab_kota} dengan ${n(bawah.total)} pemeriksaan.`
    );
  }

  if (r.perJenis.length > 1) {
    const a = r.perJenis[0];
    const b = r.perJenis[1];
    const namaA = a.jenis_sarana || a.jenis || a.nama;
    const namaB = b.jenis_sarana || b.jenis || b.nama;
    if (namaA && namaB) {
      bagian.push(
        `Bila dilihat per jenis sarana, ${namaA} menempati urutan pertama dengan ${n(a.jumlah || a.total)} kegiatan, ` +
        `diikuti ${namaB} dengan ${n(b.jumlah || b.total)} kegiatan.`
      );
    }
  }

  if (r.saranaTerbanyak.length) {
    const s = r.saranaTerbanyak[0];
    const namaSarana = s.nama || s.jenis_sarana || s.sarana;
    if (namaSarana) {
      bagian.push(`Sarana yang paling banyak diperiksa adalah ${namaSarana} sebanyak ${n(s.jumlah || s.total)} unit.`);
    }
  }

  bagian.push('Demikian ringkasan Jendela Kinerja. Silakan lanjutkan dengan pertanyaan bila ada yang ingin diperdalam.');

  return bagian.join(' ');
};

const SISTEM_LLM = `Anda pembawa acara data pengawasan obat dan makanan.
Tugas: ubah angka dashboard menjadi NASKAH NARASI LISAN berbahasa Indonesia yang akan dibacakan mesin suara.

Aturan wajib:
- Panjang 140 sampai 180 kata. Ini dibacakan sekitar satu menit. Jangan lebih.
- Bahasa Indonesia formal, mengalir, seperti pembawa acara resmi instansi pemerintah.
- Sebutkan HANYA angka yang ada di data yang diberikan. Dilarang menghitung, membulatkan ulang, menambah, atau mengarang angka.
- Jangan memakai markdown, tanda bintang, tanda pagar, tabel, atau daftar bernomor. Ini naskah untuk diucapkan, bukan dibaca.
- Jangan menulis singkatan yang tidak lazim diucapkan (tulis "persen", bukan "%").
- Boleh menonjolkan satu atau dua hal paling penting (cakupan wilayah tertinggi/terendah, rasio tidak memenuhi syarat, temuan kritis).
- Akhiri dengan satu kalimat ajakan bertanya.
- Balas dengan naskahnya saja, tanpa pembuka atau penutup lain.`;

/**
 * Minta LLM memperhalus naskah template. Gagal → kembalikan template apa adanya.
 * @returns {Promise<{naskah: string, sumber: 'llm'|'template', catatan: string|null}>}
 */
const haluskanDenganLlm = async (template, r) => {
  try {
    const hasil = await complete({
      system: SISTEM_LLM,
      user: `DATA DASHBOARD (JSON):\n${JSON.stringify({
        periode: labelPeriode(r.tahun, r.bulan) || null,
        jenis_sarana: r.jenis || null,
        total: r.total,
        per_kab_kota: r.perKab,
        per_jenis_sarana: r.perJenis,
        sarana_terbanyak: r.saranaTerbanyak,
      }, null, 1)}\n\nKERANGKA NARASI (pakai angkanya, perhalus bahasanya):\n${template}`,
      maxTokens: 520,
      temperature: 0.4,
      timeoutMs: 25000,
      label: 'presentasi-jk',
    });

    const teks = String(hasil.text || '').replace(/\s+/g, ' ').trim();
    // Jaring pengaman: kalau LLM balas terlalu pendek/panjang atau menyisakan
    // markdown, pakai template — narasi buruk lebih merugikan daripada template.
    const kata = teks.split(' ').filter(Boolean).length;
    if (kata < 90 || /[*#|]/.test(teks)) {
      return { naskah: template, sumber: 'template', catatan: `LLM menjawab ${kata} kata / berformat — memakai template` };
    }
    return { naskah: teks, sumber: 'llm', catatan: null };
  } catch (err) {
    return { naskah: template, sumber: 'template', catatan: err.message };
  }
};

/**
 * POST /api/public/presentasi
 * Body: { dashboard: <payload ringkasan JK>, pakai_llm?: boolean }
 * Balasan: { success, data: { naskah, sumber, jumlah_kata, perkiraan_detik, catatan } }
 */
const buatPresentasi = async (req, res, next) => {
  try {
    const r = rapikan(req.body || {});

    if (!r.total || Object.keys(r.total).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Data dashboard kosong. Kirim { dashboard: { total: {...}, per_kab_kota: [...] } }.'
      });
    }

    const template = naskahTemplate(r);
    const pakaiLlm = req.body?.pakai_llm !== false;
    const { naskah, sumber, catatan } = pakaiLlm
      ? await haluskanDenganLlm(template, r)
      : { naskah: template, sumber: 'template', catatan: null };

    const jumlahKata = naskah.split(/\s+/).filter(Boolean).length;

    res.json({
      success: true,
      data: {
        naskah,
        // Penanda jujur: 'llm' = diperhalus model, 'template' = langsung dari angka.
        sumber,
        catatan,
        jumlah_kata: jumlahKata,
        // ±150 kata per menit untuk TTS bahasa Indonesia.
        perkiraan_detik: Math.max(20, Math.round((jumlahKata / 150) * 60)),
        periode: labelPeriode(r.tahun, r.bulan) || null,
        ringkas: {
          sarana_diperiksa: r.total.sarana_diperiksa ?? null,
          sampel_lab: r.total.sampel_lab ?? null,
          memenuhi: r.total.memenuhi ?? null,
          tidak_memenuhi: r.total.tidak_memenuhi ?? null,
          wilayah_tertinggi: r.perKab[0]?.kab_kota || null,
          wilayah_terendah: r.perKab[r.perKab.length - 1]?.kab_kota || null,
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { buatPresentasi, naskahTemplate, rapikan };
