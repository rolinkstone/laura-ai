# 🚀 Panduan Deploy — LAURA AI

| Item | Nilai |
| --- | --- |
| Domain frontend | `https://laura-ai.bbpompky.id` |
| Domain backend | `https://data-laura.bbpompky.id` |
| Port frontend (host) | `3006` |
| Port backend (host) | `5005` |
| PostgreSQL | container `postgresql_5jhh-postgresql_5JhH-1`, port host `5432` |
| Keycloak client id | `laura-ai` |

Semua port hanya diakses lewat nginx: frontend `127.0.0.1:3006`,
backend `127.0.0.1:5005` (container backend memakai network host + bind loopback).

---

## 1. Prasyarat

```bash
docker --version          # >= 20
docker compose version
node --version            # hanya jika build di luar Docker
```

Clone repo ke server, lalu masuk ke folder project.

---

## 2. Siapkan konfigurasi (`.env`)

```bash
cp .env.example .env
nano .env
```

`docker compose` membaca `.env` ini secara otomatis. Isi minimal:

| Variabel | Catatan |
| --- | --- |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | **harus sama** dengan container `postgresql_5jhh-postgresql_5JhH-1` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `KEYCLOAK_CLIENT_SECRET` | dari Keycloak → Clients → `laura-ai` → Credentials |
| `NINEROUTER_API_KEY` | API key 9Router |

> Container backend berjalan dengan `network_mode: host`, sehingga
> `127.0.0.1:5432` adalah port host yang di-publish container PostgreSQL.
> Bila backend dipindah ke network bridge, lihat alternatif `DB_HOST`
> di komentar `.env.example`.

Verifikasi tanpa menjalankan:

```bash
docker compose config --quiet && echo "OK: compose valid"
```

---

## 3. Siapkan database

Compose **tidak** membuat PostgreSQL. Siapkan database di container yang sudah ada:

```bash
PG=postgresql_5jhh-postgresql_5JhH-1

# 3.1 buat user + database (lewati jika sudah ada)
docker exec -i $PG psql -U postgres -c "CREATE USER bbpom_ai WITH PASSWORD 'PASSWORD_ANDA';"
docker exec -i $PG psql -U postgres -c "CREATE DATABASE bbpom_ai OWNER bbpom_ai;"

# 3.2 import skema
docker exec -i $PG psql -U bbpom_ai -d bbpom_ai < backend/sql/schema.pg.sql
```

Seed data awal (opsional, jalankan setelah container backend hidup):

```bash
docker compose exec backend npm run seed
```

> ⚠️ Seeder membuat akun admin default `admin` / `admin123`.
> **Ganti password ini segera** setelah deploy pertama.

---

## 4. Konfigurasi Keycloak

Realm `master`, buat/ubah client **`laura-ai`** (Confidential):

| Setting | Nilai |
| --- | --- |
| Client authentication | `On` |
| Valid redirect URIs | `https://laura-ai.bbpompky.id/api/auth/callback/keycloak`<br>`https://laura-ai.bbpompky.id/*` |
| Valid post logout redirect URIs | `https://laura-ai.bbpompky.id/*` |
| Web origins | `https://laura-ai.bbpompky.id` |

Salin **Client secret** ke `KEYCLOAK_CLIENT_SECRET` di `.env`
(frontend & backend memakai client yang sama).

---

## 5. Build & jalankan

```bash
docker compose build          # build image backend + frontend
docker compose up -d
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

Cek langsung dari server:

```bash
curl -s http://127.0.0.1:5005/api/health
curl -sI http://127.0.0.1:3006 | head -1
```

> Catatan: `NEXT_PUBLIC_API_URL` di-*inline* saat **build**, jadi bila domain
> berubah, wajib `docker compose build frontend` (bukan hanya `up -d`).

---

## 6. Nginx reverse proxy

Buat `/etc/nginx/sites-available/laura-ai.conf`:

```nginx
# ---------- Frontend : laura-ai.bbpompky.id ----------
server {
    listen 80;
    server_name laura-ai.bbpompky.id;

    location / {
        proxy_pass         http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}

# ---------- Backend API : data-laura.bbpompky.id ----------
server {
    listen 80;
    server_name data-laura.bbpompky.id;

    client_max_body_size 25m;   # upload PDF maksimal 20 MB

    location / {
        proxy_pass         http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # WAJIB untuk respons streaming (SSE) chat AI
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Aktifkan + HTTPS:

```bash
sudo ln -s /etc/nginx/sites-available/laura-ai.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d laura-ai.bbpompky.id -d data-laura.bbpompky.id
```

---

## 7. Verifikasi

```bash
curl -s https://data-laura.bbpompky.id/api/health
curl -sI https://laura-ai.bbpompky.id | head -1
```

- [ ] `https://laura-ai.bbpompky.id` menampilkan halaman chat
- [ ] Login SSO Keycloak berhasil (redirect balik ke `/admin`)
- [ ] Chat streaming berjalan (tidak ter-buffer)
- [ ] Upload PDF berhasil
- [ ] `/api/health` → `"database":"connected"`

---

## 8. Update / redeploy

```bash
git pull
docker compose build
docker compose up -d
docker compose logs -f --tail=100 backend
```

---

## 9. ⚠️ Checklist sebelum push ke GitHub

```bash
# 1. Pastikan .env tidak ikut ter-track
git status --porcelain | grep -E "\.env$|\.env\." || echo "OK: tidak ada file .env"

# 2. Cari pola secret di file yang di-track
git grep -n -I -E "(PASSWORD|SECRET|API_KEY|TOKEN)\s*[:=]\s*[A-Za-z0-9/+=_-]{8,}" \
  -- . ':!*.example' ':!package-lock.json' ':!frontend/package-lock.json'

# 3. Pastikan folder data & uploads tidak ikut
git check-ignore -v .env data backend/uploads
```

Yang **wajib** bersih dari repo:

- `.env` root (semua secret)
- `backend/.env`, `backend/.env.production`
- `frontend/.env.local`, `frontend/.env.production`
- `data/`, `backend/uploads/`, `backend/.cache/`
- `docker-compose.yml` — **jangan** ada password/secret hardcoded

> ### 🔴 Jika secret pernah ter-push ke GitHub
> Menghapus file/nilai saja **tidak cukup** — nilai itu tetap ada di riwayat git.
> **Rotasi semua kredensial** berikut:
>
> | Kredensial | Cara rotasi |
> | --- | --- |
> | Password PostgreSQL | `ALTER USER bbpom_ai WITH PASSWORD '...'` |
> | Client secret Keycloak | Clients → `laura-ai` → Credentials → Regenerate |
> | `JWT_SECRET` | `openssl rand -base64 48` → semua token lama invalid |
> | `NEXTAUTH_SECRET` | `openssl rand -base64 32` → semua sesi login invalid |
> | Keycloak admin password | Users → admin → Credentials → Reset |
> | API key 9Router | dashboard 9Router → revoke & buat baru |
>
> Setelah itu bersihkan riwayat: `git filter-repo` (lihat catatan internal),
> atau minta GitHub Support purge cache, lalu **force push**.

---

## 10. Troubleshooting

| Gejala | Penyebab & solusi |
| --- | --- |
| Backend `database: disconnected` | Pastikan nama user/password/database di `.env` sama dengan container postgres. Cek: `docker exec -i postgresql_5jhh-postgresql_5JhH-1 psql -U bbpom_ai -d bbpom_ai -c '\conninfo'`. |
| `ECONNREFUSED 5432` | Port postgres tidak ter-publish ke host. `docker ps` harus menampilkan `0.0.0.0:5432->5432/tcp`. Bila backend dipindah ke bridge, set `DB_HOST=host.docker.internal` + `extra_hosts: host.docker.internal:host-gateway`. |
| Backend tidak bisa diakses nginx | `HOST=127.0.0.1` hanya valid untuk `network_mode: host`. Untuk network bridge, set `BACKEND_HOST=0.0.0.0` dan tambahkan port mapping `"127.0.0.1:5005:5005"`. |
| Login Keycloak: `redirect_uri not allowed` | Tambahkan URL callback di *Valid redirect URIs* client `laura-ai`. |
| Login sukses tapi API 401 | `KEYCLOAK_ISSUER` backend ≠ issuer token. Keduanya harus `https://auth.bbpompky.id/realms/master`. |
| CORS error di browser | `CORS_ORIGIN` (backend) harus persis `https://laura-ai.bbpompky.id` — tanpa trailing slash. |
| Chat "muter" tanpa output | nginx membuffer SSE → tambahkan `proxy_buffering off;`. |
| Halaman blank / API ke localhost | `NEXT_PUBLIC_API_URL` ter-*inline* saat build. Jalankan `docker compose build frontend` lalu `up -d`. |
| Model embedding diunduh ulang tiap deploy | Pastikan volume `./data/backend/.cache:/usr/src/app/.cache` terpasang. |
