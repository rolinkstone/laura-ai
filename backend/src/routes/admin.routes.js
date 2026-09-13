const express = require('express');
const {
  getStats,
  getConfig,
  getLlmConfig,
  updateLlmConfig,
  listLlmModels,
  testLlmModel,
  testLlmBatch,
  getWebSearchConfig,
  updateWebSearchConfig,
  checkWebSearchUrl
} = require('../controllers/admin.controller');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { auth, authorize } = require('../middlewares/auth');

const router = express.Router();

// Khusus role admin
router.use(auth, authorize('admin'));

const llmUpdateValidation = [
  body('enabled').optional().isBoolean().withMessage('enabled harus boolean'),
  body('providerOrder').optional({ values: 'falsy' }).isString().withMessage('providerOrder harus string'),
  body('ninerouter_model').optional({ values: 'falsy' }).isString(),
  body('ninerouter_api_key').optional({ values: 'falsy' }).isString(),
  body('ninerouter_base_url').optional({ values: 'falsy' }).isString()
];

router.get('/stats', getStats);
router.get('/config', getConfig);
router.get('/llm-config', getLlmConfig);
router.post('/llm-config', llmUpdateValidation, validate, updateLlmConfig);

// ===== Diagnosa model LLM (daftar dari gateway + uji model) =====
router.get('/llm-models', listLlmModels);
router.post(
  '/llm-test',
  body('model').optional({ values: 'falsy' }).isString().withMessage('model harus string'),
  validate,
  testLlmModel
);
// Uji banyak model sekaligus (cari model yang bisa dipakai sebelum dipasang)
router.post(
  '/llm-test-batch',
  body('models').optional({ values: 'null' }).isArray().withMessage('models harus array'),
  body('mode').optional({ values: 'falsy' }).isString().withMessage('mode harus string'),
  body('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).withMessage('limit 1-12'),
  validate,
  testLlmBatch
);

// ===== Link terpercaya (lingkup sumber web) =====
// Body: domains[], indexUrls[], allowGovSuffix, officialOnly, strictScope, reset
const webSearchUpdateValidation = [
  body('domains').optional({ values: 'null' }).isArray().withMessage('domains harus array'),
  body('indexUrls').optional({ values: 'null' }).isArray().withMessage('indexUrls harus array'),
  body('allowGovSuffix').optional().isBoolean().withMessage('allowGovSuffix harus boolean'),
  body('officialOnly').optional().isBoolean().withMessage('officialOnly harus boolean'),
  body('strictScope').optional().isBoolean().withMessage('strictScope harus boolean'),
  body('useSources').optional().isBoolean().withMessage('useSources harus boolean'),
  body('reset').optional().isBoolean().withMessage('reset harus boolean')
];

router.get('/web-search-config', getWebSearchConfig);
router.post('/web-search-config', webSearchUpdateValidation, validate, updateWebSearchConfig);
router.post(
  '/web-search-config/check',
  body('url').isString().notEmpty().withMessage('url wajib diisi'),
  validate,
  checkWebSearchUrl
);

module.exports = router;
