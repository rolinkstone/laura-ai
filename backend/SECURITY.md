# Checklist Keamanan — Backend BBPOM AI

Status setiap item untuk produksi. Centang saat diverifikasi.

## Diterapkan di Backend
- [x] **Helmet** — header keamanan HTTP (`src/app.js`)
- [x] **CORS** — whitelist origin via `CORS_ORIGIN` (`src/app.js`)
- [x] **Rate limiting** — `express-rate-limit` pada auth, chat, RAG, upload (`src/middlewares/rateLimiter.js`)
- [x] **JWT** — token bertanda tangan `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (`src/middlewares/auth.js`)
- [x] **RBAC** — role `admin`/`analyst`/`viewer` via `authorize()`; `super_admin` dapat dipetakan ke `admin`
- [x] **Input validation** — `express-validator` di semua route tulis
- [x] **File validation** — hanya PDF via `multer` fileFilter (`src/config/multer.js`)
- [x] **File size limit** — maksimal 20 MB via `multer` limits
- [x] **SQL injection protection** — semua query memakai prepared statement (`?`)
- [x] **Prompt injection protection** — deteksi pola + hardening system prompt (`src/services/ai/promptGuard.js`)
- [x] **API key protection** — kunci LLM hanya di `.env`, tidak diekspos API (endpoint `/admin/config` hanya menampilkan status bool)

## Perlu Perhatian Sebelum Production
- [ ] **Audit log** — log aktivitas admin (upload, hapus, ubah) di tabel/database audit. Saat ini `ai_logs` mencatat panggilan AI, tetapi aksi CRUD admin belum dicatat.
- [ ] **HTTPS/TLS** — wajib di belakang reverse proxy (nginx/caddy) dengan sertifikat.
- [ ] **Password policy** — minimal 6 karakter saat ini; pertimbangkan kompleksitas & rotasi.
- [ ] **JWT_SECRET kuat** — ganti dari nilai default di `.env` produksi.
- [ ] **Session token revocation** — JWT tidak bisa dicabut secara langsung; pertimbangkan token hitamlist/refresh token.
- [ ] **Rate limit per-user** — saat ini berbasis IP; tambah per-user untuk endpoint AI.
- [ ] **Upload malware scan** — validasi konten PDF lebih lanjut (ClamAV) sebelum disimpan.
- [ ] **Backup & enkripsi DB** — aktifkan enkripsi-at-rest dan backup terjadwal.
- [ ] **Logging terpusat & monitoring** — SIEM/APM untuk deteksi anomali.
- [ ] **Dependency audit** — `npm audit` secara berkala; `npm audit fix`.

## Perintah Audit
```bash
cd "g:\reactjs\BPOM AI\backend"
npm audit            # audit kerentanan dependency
npm outdated         # cek versi dependency
```

## Catatan Role
- `super_admin` / `admin` → akses penuh (termasuk manajemen user, config)
- `analyst` → kelola dokumen/FAQ/sumber, tanpa manajemen user
- `viewer` → hanya membaca & bertanya
- Chat publik → tanpa login (guest session, `user_id NULL`)
