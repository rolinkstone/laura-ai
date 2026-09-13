FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json ./

# Clean npm cache dan install dependencies
# (NODE_ENV belum production di sini agar devDependencies ikut terpasang —
#  tailwindcss/postcss dibutuhkan saat build)
RUN npm cache clean --force && \
    npm ci --no-audit --legacy-peer-deps

# Copy source code
COPY . .

# ⚠️ Variabel NEXT_PUBLIC_* di-inline saat BUILD, jadi harus diberikan
# sebagai build arg (lihat `args:` pada docker-compose.yml).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_KEYCLOAK_ISSUER
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_KEYCLOAK_ISSUER=$NEXT_PUBLIC_KEYCLOAK_ISSUER \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID

# Build aplikasi Next.js
RUN npm run build

# Set environment variable untuk port
ENV PORT=3006
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production

# Expose port yang benar
EXPOSE 3006

# Start aplikasi
CMD ["npm", "start"]