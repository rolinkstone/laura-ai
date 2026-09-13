const express = require('express');
const {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentChunks,
  addDocumentChunk,
  uploadDocument,
  downloadDocument,
  reprocessDocument,
  reembedDocument,
  createDocumentFromUrl
} = require('../controllers/document.controller');
const {
  createDocumentValidation,
  uploadDocumentValidation,
  createDocumentFromUrlValidation,
  updateDocumentValidation,
  documentIdParam
} = require('../validations/document.validation');
const validate = require('../middlewares/validate');
const { auth, authorize } = require('../middlewares/auth');
const { upload } = require('../config/multer');
const { uploadLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Wrapper untuk menangkap error multer (file bukan PDF, melebihi limit, dll)
const uploadSingle = upload.single('file');
const uploadMiddleware = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || 'Gagal mengunggah file'
      });
    }
    next();
  });
};

// Semua user yang login dapat melihat dokumen
router.get('/', auth, getDocuments);
router.get('/:id', auth, documentIdParam, validate, getDocumentById);
router.get('/:id/chunks', auth, documentIdParam, validate, getDocumentChunks);
router.get('/:id/file', auth, documentIdParam, validate, downloadDocument);

// Upload PDF (multipart, field: file) — semua user yang login
router.post(
  '/upload',
  auth,
  authorize('admin', 'analyst', 'viewer'),
  uploadLimiter,
  uploadMiddleware,
  uploadDocumentValidation,
  validate,
  uploadDocument
);

// Tambah dokumen dari URL (HTML/PDF) — semua user yang login
router.post(
  '/from-url',
  auth,
  authorize('admin', 'analyst', 'viewer'),
  uploadLimiter,
  createDocumentFromUrlValidation,
  validate,
  createDocumentFromUrl
);

// Semua user yang login dapat menambah/mengubah/menghapus dokumen
router.post('/', auth, authorize('admin', 'analyst', 'viewer'), createDocumentValidation, validate, createDocument);
router.post('/:id/chunks', auth, authorize('admin', 'analyst', 'viewer'), documentIdParam, validate, addDocumentChunk);
router.put('/:id', auth, authorize('admin', 'analyst', 'viewer'), updateDocumentValidation, validate, updateDocument);
router.patch('/:id/active', auth, authorize('admin', 'analyst', 'viewer'), updateDocumentValidation, validate, updateDocument);
router.post('/:id/reprocess', auth, authorize('admin', 'analyst', 'viewer'), documentIdParam, validate, reprocessDocument);
router.post('/:id/reembed', auth, authorize('admin', 'analyst', 'viewer'), documentIdParam, validate, reembedDocument);
router.delete('/:id', auth, authorize('admin', 'analyst', 'viewer'), documentIdParam, validate, deleteDocument);

module.exports = router;
