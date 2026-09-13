require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/db');
const llmConfig = require('./services/llmConfigService');

const PORT = Number(process.env.PORT) || 5005;
// HOST default 0.0.0.0 (semua interface). Set HOST=127.0.0.1 agar server
// hanya bisa diakses lewat reverse proxy di mesin yang sama.
const HOST = process.env.HOST || '0.0.0.0';

const start = async () => {
  // Pastikan koneksi DB berhasil sebelum server menerima request
  const connected = await testConnection();
  if (!connected) {
    console.warn('⚠️ Server tetap berjalan, tetapi database tidak terhubung. Periksa file .env');
  }

  // Muat konfigurasi LLM runtime (dari tabel settings, fallback .env)
  try {
    await llmConfig.loadConfig();
    console.log('⚙️  Konfigurasi LLM runtime dimuat');
  } catch (err) {
    console.warn('⚠️ Gagal memuat konfigurasi LLM runtime:', err.message);
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server BPOM AI berjalan di http://${HOST}:${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   API base    : http://${HOST}:${PORT}/api`);
  });
};

start();
