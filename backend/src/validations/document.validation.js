const { body, param } = require('express-validator');

const createDocumentValidation = [
  body('title').trim().notEmpty().withMessage('Judul dokumen wajib diisi').isLength({ max: 255 }),
  body('description').optional({ nullable: true }).isString(),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('category_id tidak valid'),
  body('source_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('source_id tidak valid'),
  body('file_path').optional({ nullable: true }).isString(),
  body('file_type').optional({ nullable: true }).isString().isLength({ max: 50 }),
  body('document_date').optional({ values: 'falsy' }).isDate().withMessage('document_date harus format YYYY-MM-DD'),
  body('effective_date').optional({ values: 'falsy' }).isDate().withMessage('effective_date harus format YYYY-MM-DD'),
  body('status')
    .optional()
    .isIn(['draft', 'uploaded', 'processing', 'ready', 'failed'])
    .withMessage('Status tidak valid')
];

// Validasi untuk upload PDF (multipart).
// Field dari multer berupa string; gunakan optional({ values: 'falsy' })
// agar field kosong dilewati.
const uploadDocumentValidation = [
  body('title').trim().notEmpty().withMessage('Judul dokumen wajib diisi').isLength({ max: 255 }),
  body('description').optional({ values: 'falsy' }).isString(),
  body('category_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('category_id tidak valid'),
  body('source_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('source_id tidak valid'),
  body('document_date').optional({ values: 'falsy' }).isDate().withMessage('document_date harus format YYYY-MM-DD'),
  body('effective_date').optional({ values: 'falsy' }).isDate().withMessage('effective_date harus format YYYY-MM-DD')
];

const updateDocumentValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID dokumen tidak valid'),
  body('title').optional().trim().isLength({ max: 255 }),
  body('is_active').optional().isIn([0, 1, '0', '1']).withMessage('is_active harus 0 atau 1'),
  body('status')
    .optional()
    .isIn(['draft', 'uploaded', 'processing', 'ready', 'failed'])
    .withMessage('Status tidak valid')
];

const createDocumentFromUrlValidation = [
  body('url')
    .trim()
    .notEmpty().withMessage('URL wajib diisi')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Format URL tidak valid'),
  body('title').optional({ values: 'falsy' }).trim().isLength({ max: 255 }).withMessage('Judul maksimal 255 karakter'),
  body('description').optional({ values: 'falsy' }).isString(),
  body('category_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('category_id tidak valid'),
  body('source_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('source_id tidak valid')
];

const documentIdParam = [
  param('id').isInt({ min: 1 }).withMessage('ID dokumen tidak valid')
];

module.exports = {
  createDocumentValidation,
  uploadDocumentValidation,
  createDocumentFromUrlValidation,
  updateDocumentValidation,
  documentIdParam
};
