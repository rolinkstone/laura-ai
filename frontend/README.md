# Frontend LAURA AI (Next.js)

Frontend untuk asisten BPOM AI — **chat publik** + **admin console**.

## 🚀 Menjalankan

Pastikan backend berjalan di `http://localhost:5005`, lalu:

```bash
cd "g:\reactjs\BPOM AI new\frontend"
npm install
npm run dev
```

Buka `http://localhost:3006`.

Konfigurasi API di `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5005/api
```

## 📄 Halaman

| Route | Keterangan |
| --- | --- |
| `/` | **Chat publik** (tanpa login): streaming, markdown, sources, suggested questions, feedback |
| `/login` | Login admin (JWT) |
| `/admin` | Dashboard (statistik, log AI, percakapan) |
| `/admin/dokumen` | Upload PDF, edit metadata, aktif/nonaktif, delete, re-process, re-embedding |
| `/admin/faq` | CRUD FAQ |
| `/admin/kategori` | Tree Knowledge Base + CRUD kategori |
| `/admin/sumber` | CRUD sumber referensi |
| `/admin/ai` | Status konfigurasi LLM/RAG + uji vector search |
| `/admin/riwayat` | Riwayat percakapan (semua sesi) |

## 🔐 Autentikasi

- Chat publik **tidak perlu login** (guest session).
- Admin: login via `/api/auth/login` → token JWT disimpan di `localStorage`.
- Proteksi halaman `/admin` dilakukan di client (`admin/layout.jsx`) — untuk produksi disarankan menambahkan middleware server-side.

## 🔐 Autentikasi (Keycloak SSO + manual)

- **SSO**: tombol "Masuk dengan Keycloak" di `/login` memakai **NextAuth** (`/api/auth/[...nextauth]`) dengan provider Keycloak. Setelah login, access token ditukar ke JWT aplikasi lewat `POST /api/auth/keycloak`.
- **Manual**: form username/password (`admin`/`admin123`) tetap tersedia sebagai cadangan.
- Logout memakai `signOut()` (redirect ke Keycloak end-session).
- Konfigurasi di `.env.local`: `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID` (`laura-ai`), `KEYCLOAK_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
- ⚠️ Jangan pakai secret dev (`secer`) di produksi — lihat `DEPLOY.md`.

## 🧱 Struktur

```
src/
├── app/
│   ├── page.jsx             # chat publik
│   ├── login/page.jsx
│   └── admin/               # layout + halaman admin
├── components/
│   ├── chat/                # Chat, Markdown
│   └── admin/               # Sidebar, ui primitives
└── lib/
    └── api.js               # API client (JWT + streaming SSE)
```

## ✨ Fitur Chat Publik

- Streaming jawaban via SSE (`/api/public/chat/stream`)
- Markdown (react-markdown + remark-gfm)
- Panel sumber (judul, section, halaman, skor)
- Pertanyaan saran (suggested questions)
- Feedback 👍 / 👎
- Riwayat percakapan di localStorage per browser
