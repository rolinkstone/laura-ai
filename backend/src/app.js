const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// ============ Reverse proxy (nginx) ============
// Di belakang nginx, header X-Forwarded-For dipakai express-rate-limit untuk
// mengenali IP pengguna. Tanpa ini seluruh trafik dianggap berasal dari nginx
// dan express-rate-limit melempar ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
//   TRUST_PROXY=1        -> percaya 1 hop proxy (default produksi)
//   TRUST_PROXY=loopback -> hanya proxy di localhost
//   kosong/false         -> nonaktif (tanpa reverse proxy)
const rawTrustProxy = process.env.TRUST_PROXY;
if (rawTrustProxy && rawTrustProxy !== 'false' && rawTrustProxy !== '0') {
  const asNumber = Number(rawTrustProxy);
  app.set('trust proxy', Number.isNaN(asNumber) ? rawTrustProxy : asNumber);
}

// ============ Middleware global ============
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============ Health check ============
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BPOM AI API',
    message: 'Asisten BPOM AI backend berjalan',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const { testConnection } = require('./config/db');
    const dbConnected = await testConnection();
    res.json({
      status: dbConnected ? 'ok' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
  }
});

// ============ Routes API ============
app.use('/api', routes);

// ============ 404 & Error handler ============
app.use(notFound);
app.use(errorHandler);

module.exports = app;
