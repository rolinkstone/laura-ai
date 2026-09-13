const { body } = require('express-validator');

const createFeedbackValidation = [
  body('message_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('message_id tidak valid'),
  body('rating')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 }).withMessage('Rating harus 1-5'),
  body('comment').optional({ nullable: true }).trim().isLength({ max: 1000 })
];

module.exports = { createFeedbackValidation };
