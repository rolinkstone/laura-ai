const express = require('express');
const { getFeedback, createFeedback } = require('../controllers/feedback.controller');
const { createFeedbackValidation } = require('../validations/feedback.validation');
const validate = require('../middlewares/validate');
const { auth } = require('../middlewares/auth');

const router = express.Router();

router.use(auth);

router.get('/', getFeedback);
router.post('/', createFeedbackValidation, validate, createFeedback);

module.exports = router;
