const express = require('express');
const { auth, authorize } = require('../middlewares/auth');
const {
  listEndpoints,
  getEndpoint,
  createEndpoint,
  imporLink,
  updateEndpoint,
  deleteEndpoint,
  syncOne,
  syncMany,
  issueEndpointToken,
  revokeEndpointToken,
  getBearer,
  setBearer
} = require('../controllers/jkIntegration.controller');

const router = express.Router();

// Seluruh pengelolaan integrasi JK hanya untuk admin.
router.use(auth, authorize('admin'));

router.get('/', listEndpoints);
router.post('/impor', imporLink);
router.post('/sync-all', syncMany);
router.get('/bearer', getBearer);
router.put('/bearer', setBearer);
router.get('/:id', getEndpoint);
router.post('/', createEndpoint);
router.put('/:id', updateEndpoint);
router.delete('/:id', deleteEndpoint);
router.post('/:id/sync', syncOne);
router.post('/:id/token', issueEndpointToken);
router.delete('/:id/token', revokeEndpointToken);

module.exports = router;
