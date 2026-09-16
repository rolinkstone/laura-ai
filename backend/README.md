# Backend API Asisten BPOM AI

Backend untuk aplikasi asisten BPOM AI menggunakan **Express.js** + **PostgreSQL**.

## 🧱 Teknologi

| Kebutuhan      | Library yang dipakai      |
| -------------- | ------------------------- |
| Framework      | Express.js                |
| Environment    | dotenv                    |
| CORS           | cors                      |
| Keamanan HTTP  | helmet                    |
| Hash password  | bcrypt                    |
| JWT            | jsonwebtoken              |
| Database       | pg (connection pool PostgreSQL) |
| Validasi       | express-validator         |

## 📁 Struktur

```
backend/
├── .env                  # konfigurasi (jangan di-commit)
├── .env.example          # contoh konfigurasi
├── package.json
├── sql/
│   └── schema.pg.sql      # DDL PostgreSQL untuk semua tabel
└── src/
    ├── server.js         # entry point
    ├── app.js            # konfigurasi express
    ├── config/
    │   └── db.js         # koneksi pool pg (PostgreSQL)
    ├── middlewares/      # auth, validate, errorHandler
    ├── validations/      # express-validator rules
    ├── controllers/      # logika bisnis
    ├── routes/           # definisi route
    └── scripts/
        ├── createSchema.js  # membuat database & tabel dari schema.pg.sql
        └── seed.js          # data awal (roles, admin, faq, dll)
```

## 🚀 Cara Menjalankan

### 1. Install dependency

```bash
npm install
```

### 2. Siapkan environment

Salin `.env.example` menjadi `.env`, lalu sesuaikan kredensial PostgreSQL
(port default **5432**):

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=bbpom_ai
DB_PASSWORD=password_anda
DB_NAME=bbpom_ai
```

> Deploy ke server memakai container PostgreSQL yang **sudah ada**
> (mis. `postgresql_5jhh-postgresql_5JhH-1`). Lihat `DEPLOY.md` di root repo.
> Import skema manual bila perlu:
> `docker exec -i <container> psql -U <user> -d <db> < backend/sql/schema.pg.sql`

### 3. Buat database & tabel

```bash
npm run db:schema
```

### 4. Seed data awal (roles, admin, kategori, faq)

```bash
npm run seed
```

> Seeder tidak membuat user admin. Login memakai **Keycloak SSO** — user lokal
> dibuat otomatis saat login pertama, dengan role dari realm role Keycloak
> (`admin`/`super_admin` → admin, `analyst` → analyst, lainnya → viewer).

### 5. Jalankan server

```bash
npm run dev      # development (nodemon)
npm start        # production
```

Server berjalan di `http://localhost:5005`. Cek status koneksi di:
`GET http://localhost:5005/api/health`

## 📚 Endpoint Utama

| Method | Endpoint                    | Auth | Deskripsi                              |
| ------ | --------------------------- | ---- | -------------------------------------- |
| POST   | `/api/auth/register`        | -    | Registrasi user                        |
| POST   | `/api/auth/login`           | -    | Login, dapat token JWT                 |
| GET    | `/api/auth/me`              | ✔    | Profile user login                     |
| GET/POST/PUT/DELETE | `/api/users`      | ✔ admin | Manajemen user                       |
| GET/POST/PUT/DELETE | `/api/roles`      | ✔    | Manajemen role                         |
| GET/POST/PUT/DELETE | `/api/documents`  | ✔    | Manajemen dokumen (list: paginasi + pencarian) |
| POST   | `/api/documents/upload` | ✔ admin/analyst | Upload PDF + proses ekstraksi teks |
| POST   | `/api/documents/from-url` | ✔ admin/analyst | Tambah dokumen dari URL (HTML/PDF) |
| GET    | `/api/documents/:id/file` | ✔  | Unduh file dokumen                    |
| GET    | `/api/documents/:id/chunks` | ✔    | Potongan teks dokumen (RAG)            |
| GET/POST/PUT/DELETE | `/api/sources`    | ✔    | Manajemen sumber referensi             |
| GET/POST/PUT/DELETE | `/api/faq`        | ✔*   | Manajemen FAQ (*list publik tanpa login)|
| POST   | `/api/chat`                 | ✔    | **RAG**: tanya → jawaban + sources     |
| GET/POST | `/api/chat/sessions`      | ✔    | Kelola sesi percakapan                 |
| POST   | `/api/chat/sessions/:id/messages` | ✔ | Kirim pesan dalam sesi (RAG)         |
| POST   | `/api/rag/search`          | ✔    | Vector search chunk (tanpa LLM)        |
| GET/POST | `/api/feedback`          | ✔    | Feedback jawaban AI                    |
| GET    | `/api/knowledge-base`      | -    | Tree Knowledge Base (publik)           |

## 🗄️ Tabel Database

`roles`, `users`, `sources`, `document_categories`, `documents`, `document_chunks`,
`faq`, `chat_sessions`, `chat_messages`, `ai_logs`, `feedback`

## 📄 Daftar Dokumen: Paginasi & Pencarian

`GET /api/documents` menerima query berikut (semua opsional):

| Query         | Default | Keterangan                                                        |
| ------------- | ------- | ----------------------------------------------------------------- |
| `page`        | `1`     | Halaman ke- (otomatis dijepit bila melebihi jumlah halaman)        |
| `limit`       | `10`    | Baris per halaman (maks 100)                                      |
| `search`      | -       | Cari di judul, deskripsi, nama kategori, dan nama sumber (ILIKE)   |
| `category_id` | -       | Filter kategori                                                   |
| `status`      | -       | Filter status (`ready`, `processing`, `failed`, `draft`, ...)      |

Respons menyertakan `meta`:

```json
{
  "success": true,
  "data": [ /* 10 baris */ ],
  "meta": { "page": 1, "limit": 10, "total": 87, "totalPages": 9 }
}
```

Karakter `%`, `_`, dan `\` pada `search` di-escape sehingga diperlakukan sebagai teks biasa.

## 📤 Upload & Pemrosesan PDF

`POST /api/documents/upload` (multipart/form-data, field `file`) — khusus admin/analyst.

Field: `file`, `title` (wajib), `description`, `category_id`, `source_id`, `document_date`, `effective_date`.

Pipeline otomatis setelah upload:

```
PDF → simpan file (uploads/) → simpan metadata (documents)
    → PDFParse (pdf-parse v2) → teks per halaman
    → bersihkan teks (hilangkan karakter kontrol, rapikan spasi)
    → chunking per paragraf (mempertahankan nomor halaman & judul/section)
    → simpan ke document_chunks → status dokumen = ready
```

- Library: **multer** (upload), **pdf-parse v2** (ekstraksi teks), `pdf-lib` (dev, untuk membuat PDF uji).
- Chunk menyimpan `metadata.page` = halaman awal potongan teks (untuk sitasi RAG).
- Metadata pemrosesan disimpan di kolom `documents.metadata` (`numPages`, `charCount`, `chunkCount`).
- File PDF tersimpan di folder `uploads/` dengan nama unik.

## 🔐 Autentikasi & SSO Keycloak

Backend mendukung dua jalur autentikasi:

1. **JWT aplikasi** — `POST /api/auth/login` (username/password lokal).
2. **Keycloak SSO** — `POST /api/auth/keycloak` menerima access token Keycloak, diverifikasi via JWKS endpoint issuer (`KEYCLOAK_ISSUER`), lalu user disinkronkan ke tabel `users` (upsert).

Middleware `auth` otomatis menerima **kedua token**: coba JWT aplikasi dulu, lalu fallback ke token Keycloak. RBAC lokal (`admin`/`analyst`/`viewer`) tetap dipakai; pemetaan role dari realm roles Keycloak:

| Role Keycloak | Role Lokal |
| --- | --- |
| `super_admin`, `admin` | `admin` |
| `operator`, `analyst`, `petugas` | `analyst` |
| lainnya | `viewer` |

Konfigurasi di `.env` (lihat `.env.example`). User Keycloak tidak bisa login via password (password di-hash acak).

## 🌐 Dokumen dari URL (Web Scraper)

`POST /api/documents/from-url` — mengubah halaman web (HTML) atau file PDF online menjadi dokumen yang dapat dicari di RAG.

Body: `{ url, title?, description?, category_id?, source_id? }`

Alur: buka URL → ambil teks utama (buang nav/footer) atau PDF → chunking → embedding → `document_chunks`.

**TLS**: beberapa situs pemerintah memiliki sertifikat tidak lengkap. Jika fetch gagal dengan `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, set `WEB_ALLOW_INSECURE_TLS=true` di `.env` (⚠️ hanya untuk development).

## 🤖 RAG Engine

Endpoint utama: `POST /api/chat` (auth).

Body: `{ "question": "...", "session_id": 1, "category_id": 14, "limit": 5 }`

Alur pipeline:

```
Pertanyaan → embedding (transformers.js lokal)
    → vector search PostgreSQL (cosine similarity di Node, embedding disimpan sebagai JSONB)
    → ambil chunk paling relevan → bangun context (SYSTEM + SOURCE)
    → LLM (OpenAI / Gemini) → jawaban + sources
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "...",
    "sources": [{ "title": "SK Standar Pelayanan Publik 2026", "page": 12, "section": "BAB III", "score": 0.87 }],
    "session_id": 5,
    "model": "gpt-4o-mini"
  }
}
```

Struktur provider LLM: `src/services/ai/` → `ai.service.js` (orchestrator), `openai.provider.js`, `gemini.provider.js`.

- Konfigurasi di `.env`: `AI_PROVIDER` (`openai`/`gemini`/`deepseek`), `OPENAI_API_KEY`/`OPENAI_MODEL`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL`.
- **Multi-provider + fallback**: `AI_PROVIDER` bisa berisi beberapa provider dipisah koma, mis. `gemini,deepseek` — dicoba berurutan; jika utama gagal/kena limit, otomatis lanjut ke cadangan.
- Tanpa API key, sistem berjalan **tanpa LLM** (fallback): mengembalikan sumber paling relevan sebagai jawaban.
- Setiap percakapan disimpan ke `chat_sessions`/`chat_messages`, dan setiap panggilan dicatat di `ai_logs`.

## 📌 Catatan

- Embedding memakai model lokal `Xenova/multilingual-e5-small` (384 dimensi, mendukung Bahasa Indonesia), diunduh sekali dari HuggingFace.
- Jawaban asisten menggunakan RAG; tanpa dokumen yang relevan di KB, asisten akan menyatakan tidak memiliki informasi.
