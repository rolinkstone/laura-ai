/**
 * Script seed data awal:
 *  - 3 role (admin, analyst, viewer)
 *  - contoh kategori dokumen, sumber, dan FAQ
 *
 * Catatan: TIDAK membuat user admin — login sepenuhnya lewat Keycloak.
 *
 * Jalankan: npm run seed
 */
require('dotenv').config();
const { pool } = require('../config/db');

const seed = async () => {
  try {
    console.log('🌱 Menjalankan seed data...\n');

    // ============ 1. Roles ============
    const roles = [
      ['admin', 'Administrator dengan akses penuh'],
      ['analyst', 'Analis / pengguna yang mengelola dokumen'],
      ['viewer', 'Pengguna yang hanya dapat membaca dan bertanya']
    ];

    for (const [name, description] of roles) {
      await pool.query(
        `INSERT INTO roles (name, description) VALUES (?, ?)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [name, description]
      );
    }
    console.log('✅ Roles siap (admin, analyst, viewer)');

    // ============ 2. Admin user ============
    // TIDAK dibuat di sini. Login sepenuhnya lewat Keycloak: user lokal dibuat
    // otomatis saat login SSO (lihat services/keycloakService.js) dengan role
    // dari realm role Keycloak: admin/super_admin → admin,
    // operator/analyst/petugas → analyst, lainnya → viewer.

    // ============ 3. Knowledge Base - Kategori dokumen (hierarki) ============
    const [docCount] = await pool.query('SELECT COUNT(*) AS c FROM documents');
    if (docCount[0].c > 0) {
      console.log('⚠️ Dokumen sudah terhubung ke kategori, kategori tidak di-reset.');
    } else {
      await pool.query('DELETE FROM document_categories');
    }

    const kbTree = [
      {
        name: 'BBPOM Palangka Raya',
        description: 'Informasi layanan dan kebijakan Balai POM Palangka Raya',
        children: [
          { name: 'Standar Pelayanan', description: 'Standar dan komitmen pelayanan publik' },
          { name: 'Informasi Layanan', description: 'Informasi umum mengenai layanan yang tersedia' },
          { name: 'FAQ', description: 'Pertanyaan yang sering diajukan (Frequently Asked Questions)' },
          { name: 'Pengaduan', description: 'Informasi dan alur pengaduan masyarakat' },
          { name: 'Kontak', description: 'Informasi kontak layanan' },
          { name: 'Jam Pelayanan', description: 'Jam operasional pelayanan' },
          { name: 'Informasi Pelaku Usaha', description: 'Informasi untuk pelaku usaha' }
        ]
      },
      {
        name: 'BPOM RI',
        description: 'Regulasi, pedoman, dan informasi resmi dari BPOM RI',
        children: [
          { name: 'Regulasi', description: 'Regulasi yang berlaku' },
          { name: 'Pedoman', description: 'Pedoman resmi BPOM' },
          { name: 'Peraturan', description: 'Peraturan perundang-undangan' },
          { name: 'Petunjuk Teknis', description: 'Petunjuk teknis pelaksanaan' },
          { name: 'Informasi Produk', description: 'Informasi produk obat, makanan, kosmetik' }
        ]
      }
    ];

    const insertCategory = async (name, description, parentId = null) => {
      const [result] = await pool.query(
        'INSERT INTO document_categories (name, description, parent_id) VALUES (?, ?, ?)',
        [name, description, parentId]
      );
      return result.insertId;
    };

    for (const top of kbTree) {
      const parentId = await insertCategory(top.name, top.description);
      for (const child of top.children) {
        await insertCategory(child.name, child.description, parentId);
      }
    }
    console.log('✅ Knowledge Base kategori siap (BBPOM Palangka Raya & BPOM RI)');

    // ============ 4. Sumber referensi ============
    const sources = [
      ['Website BPOM', 'url', 'https://www.pom.go.id', 'Portal resmi BPOM'],
      ['Perundang-undangan', 'regulasi', null, 'Kumpulan peraturan perundang-undangan']
    ];

    for (const [name, type, url, description] of sources) {
      // Tidak ada constraint unik di tabel sources → MySQL juga tidak pernah
      // memicu ON DUPLICATE; cukup INSERT biasa (paritas perilaku).
      await pool.query(
        'INSERT INTO sources (name, type, url, description) VALUES (?, ?, ?, ?)',
        [name, type, url, description]
      );
    }
    console.log('✅ Sumber referensi siap');

    // ============ 5. FAQ ============
    // Kategori FAQ disamakan dengan nama kategori di Knowledge Base
    const faqs = [
      // BBPOM Palangka Raya
      ['Apa itu BPOM?', 'Badan Pengawas Obat dan Makanan (BPOM) adalah lembaga pemerintah yang bertugas mengawasi peredaran obat dan makanan di Indonesia.', 'FAQ'],
      ['Apa saja jenis produk yang diawasi BPOM?', 'BPOM mengawasi obat, obat tradisional, kosmetik, suplemen kesehatan, dan makanan olahan.', 'FAQ'],
      ['Bagaimana cara cek izin edar produk?', 'Anda dapat mengecek izin edar produk melalui aplikasi Cek BPOM atau website resmi BPOM dengan memasukkan nomor izin edar.', 'Informasi Pelaku Usaha'],
      ['Bagaimana prosedur pendaftaran produk kosmetik?', 'Pendaftaran produk kosmetik dilakukan melalui sistem Notifkos yang disediakan BPOM secara online.', 'Informasi Pelaku Usaha'],
      ['Apa saja standar pelayanan di BPOM Palangka Raya?', 'Standar pelayanan mencakup kejelasan prosedur, waktu pelayanan, biaya, dan kompetensi petugas. Detail lengkap dapat dilihat pada dokumen standar pelayanan.', 'Standar Pelayanan'],
      ['Bagaimana cara mengajukan pengaduan?', 'Pengaduan masyarakat dapat disampaikan melalui kanal pengaduan resmi BPOM, termasuk aplikasi/website serta email pengaduan.', 'Pengaduan'],
      ['Bagaimana cara menghubungi BPOM Palangka Raya?', 'Informasi kontak resmi dapat dilihat pada halaman kontak, termasuk alamat, telepon, dan email layanan.', 'Kontak'],
      ['Kapan jam pelayanan BPOM Palangka Raya?', 'Jam pelayanan mengikuti jam operasional yang berlaku (hari kerja). Detail jam layanan dapat dilihat pada halaman jam pelayanan.', 'Jam Pelayanan'],
      // BPOM RI
      ['Di mana saya bisa membaca regulasi BPOM?', 'Regulasi BPOM tersedia di situs resmi BPOM dan Jaringan Dokumentasi dan Informasi Hukum (JDIH) BPOM.', 'Regulasi'],
      ['Apa saja pedoman yang diterbitkan BPOM?', 'BPOM menerbitkan berbagai pedoman teknis terkait pengawasan obat dan makanan, tersedia di situs resmi BPOM.', 'Pedoman'],
      ['Bagaimana cara mendapatkan petunjuk teknis?', 'Petunjuk teknis dapat diunduh melalui kanal resmi BPOM sesuai sektor yang dibutuhkan.', 'Petunjuk Teknis']
    ];

    for (const [question, answer, category] of faqs) {
      // Tidak ada constraint unik di tabel faq → cukup INSERT biasa.
      await pool.query(
        'INSERT INTO faq (question, answer, category) VALUES (?, ?, ?)',
        [question, answer, category]
      );
    }
    console.log('✅ FAQ siap');

    console.log('\n🎉 Seed data selesai.');
  } catch (err) {
    console.error('❌ Gagal menjalankan seed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

seed();
