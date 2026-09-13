FROM node:24-slim

WORKDIR /usr/src/app

# Build tools untuk native module (bcrypt, onnxruntime, dll) — image Debian/glibc
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# CATATAN: file .env TIDAK disalin ke dalam image (lihat .dockerignore).
# Seluruh konfigurasi + secret diberikan lewat environment docker-compose.

EXPOSE 5005

CMD ["node", "server.js"]