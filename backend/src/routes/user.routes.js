const express = require('express');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/user.controller');
const { createUserValidation, updateUserValidation, userIdParam } = require('../validations/user.validation');
const validate = require('../middlewares/validate');
const { auth, authorize } = require('../middlewares/auth');

const router = express.Router();

// Semua route user hanya boleh diakses admin
router.use(auth, authorize('admin'));

router.get('/', getUsers);
router.get('/:id', userIdParam, validate, getUserById);
router.post('/', createUserValidation, validate, createUser);
router.put('/:id', updateUserValidation, validate, updateUser);
router.delete('/:id', userIdParam, validate, deleteUser);

module.exports = router;