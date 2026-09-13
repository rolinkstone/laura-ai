/**
 * Membuat PDF uji berisi beberapa halaman dengan judul BAB & section
 * untuk menguji pipeline: upload → ekstraksi teks → pembersihan → chunking.
 * Jalankan: node src/scripts/createTestPdf.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const run = async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const content = [
    ['BAB I - PENDAHULUAN', [
      '1.1 Latar Belakang',
      'Badan Pengawas Obat dan Makanan (BPOM) merupakan lembaga pemerintah yang bertugas mengawasi peredaran obat dan makanan di Indonesia.',
      'Pengawasan dilakukan untuk melindungi masyarakat dari produk yang tidak memenuhi standar keamanan, mutu, dan khasiat.',
      'Asisten BPOM AI dikembangkan untuk membantu masyarakat menemukan informasi layanan secara cepat dan akurat.',
      'Dokumen ini menjelaskan berbagai layanan yang tersedia serta prosedur yang harus dipenuhi oleh masyarakat dan pelaku usaha.'
    ]],
    ['BAB II - INFORMASI LAYANAN', [
      '2.1 Jenis Layanan',
      'BPOM Palangka Raya menyediakan layanan pengaduan masyarakat, konsultasi regulasi, pendaftaran produk, serta informasi keamanan pangan.',
      '2.2 Persyaratan',
      'Setiap pemohon layanan wajib melengkapi dokumen persyaratan yang berlaku sesuai jenis layanan yang diminta.',
      '2.3 Biaya Layanan',
      'Seluruh layanan informasi dan pengaduan tidak dipungut biaya apapun atau gratis.'
    ]],
    ['BAB III - PENGADUAN MASYARAKAT', [
      '3.1 Cara Menyampaikan Pengaduan',
      'Pemohon dapat menyampaikan pengaduan melalui kanal pengaduan resmi BPOM, baik melalui website, aplikasi, surat elektronik, maupun datang langsung ke kantor.',
      '3.2 Data yang Diperlukan',
      'Pengaduan yang disampaikan harus mencantumkan identitas pelapor, uraian kejadian, bukti pendukung, serta lokasi dan waktu kejadian.',
      '3.3 Jangka Waktu Penanganan',
      'Pengaduan yang lengkap akan ditindaklanjuti paling lambat lima hari kerja setelah diterima oleh petugas.',
      '3.4 Kerahasiaan',
      'Identitas pelapor dijamin kerahasiaannya oleh BPOM sesuai ketentuan perlindungan pelapor.'
    ]],
    ['BAB IV - JAM PELAYANAN', [
      '4.1 Hari Kerja',
      'Pelayanan dilaksanakan pada hari Senin sampai dengan Jumat setiap minggu.',
      '4.2 Waktu Pelayanan',
      'Jam pelayanan dimulai pukul delapan pagi sampai pukul empat sore waktu setempat, dengan istirahat pada siang hari.'
    ]],
    ['BAB V - KONTAK', [
      '5.1 Alamat Kantor',
      'Kantor BPOM Palangka Raya beralamat di wilayah Kota Palangka Raya, Provinsi Kalimantan Tengah.',
      '5.2 Saluran Komunikasi',
      'Masyarakat dapat menghubungi layanan melalui telepon, surat elektronik, atau kanal media sosial resmi yang tersedia.'
    ]]
  ];

  for (const [sectionTitle, paragraphs] of content) {
    const page = doc.addPage();
    page.drawText(sectionTitle, { x: 50, y: 740, size: 16, font: fontBold });
    let y = 700;
    for (const p of paragraphs) {
      const words = p.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, 12) > 500) {
          page.drawText(line, { x: 50, y, size: 12, font });
          y -= 20;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) {
        page.drawText(line, { x: 50, y, size: 12, font });
        y -= 28;
      }
      y -= 8;
    }
  }

  const bytes = await doc.save();
  const outPath = path.join(__dirname, '..', '..', 'test-sample.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log(`✅ PDF uji dibuat: ${outPath} (${content.length} halaman)`);
};

run().catch((err) => {
  console.error('❌ Gagal membuat PDF uji:', err.message);
  process.exit(1);
});
