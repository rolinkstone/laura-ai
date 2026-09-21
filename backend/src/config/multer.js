const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Folder penyimpanan file upload
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Batas ukuran file upload (MB). Ubah di SATU tempat ini saja.
// Catatan: bila di belakang nginx, `client_max_body_size` harus lebih besar
// dari nilai ini (lihat DEPLOY.md).
const MAX_UPLOAD_MB = 50;

// Buat folder jika belum ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${unique}${ext}`);
  }
});

// Hanya menerima file PDF
const fileFilter = (req, file, cb) => {
  const isPdf =
    file.mimetype === 'application/pdf' ||
    path.extname(file.originalname).toLowerCase() === '.pdf';

  if (isPdf) {
    cb(null, true);
  } else {
    const err = new Error('Hanya file PDF yang diperbolehkan');
    err.status = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

/**
 * Ubah error multer menjadi pesan Indonesia yang jelas.
 * MulterError bawaan berbahasa Inggris (mis. "File too large") dan tanpa status.
 * @param {Error & {code?: string, status?: number}} err
 * @returns {Error & {status: number}}
 */
const normalizeMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    err.status = 413;
    err.message = `Ukuran file terlalu besar. Maksimal ${MAX_UPLOAD_MB} MB.`;
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    err.status = 400;
    err.message = 'Field file tidak dikenali (gunakan field "file")';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    err.status = 400;
    err.message = 'Hanya boleh mengunggah satu file';
  } else if (err.code && err.code.startsWith('LIMIT_')) {
    err.status = 400;
    err.message = 'File tidak memenuhi batas unggah';
  } else if (!err.status) {
    err.status = 400;
  }
  return err;
};

module.exports = { upload, UPLOAD_DIR, MAX_UPLOAD_MB, normalizeMulterError };
