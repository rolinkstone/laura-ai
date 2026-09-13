const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Folder penyimpanan file upload
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

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
  limits: { fileSize: 20 * 1024 * 1024 } // maksimal 20 MB
});

module.exports = { upload, UPLOAD_DIR };
