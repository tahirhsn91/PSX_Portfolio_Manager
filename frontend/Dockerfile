# =============================================================================
# PSX Portfolio Manager — Production Dockerfile (multi-stage)
#
# Stage 1 "builder"  : Node 20 Alpine  → npm ci → vite build → /app/dist
# Stage 2 "runner"   : Nginx Alpine    → serve /app/dist as a static SPA
#
# Build:
#   docker build -t psx-portfolio-manager .
#
# Build with env vars injected at build time (Vite bakes them into the bundle):
#   docker build \
#     --build-arg VITE_MARKET_API_URL=https://api.example.com \
#     --build-arg VITE_MARKET_API_KEY=secret \
#     -t psx-portfolio-manager .
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build tools needed by some native npm packages
RUN apk add --no-cache libc6-compat

WORKDIR /app

# ① Copy manifests first — Docker caches this layer until package*.json changes
COPY package.json package-lock.json* ./

# ② Install ALL deps (including devDeps needed by vite/tsc)
# npm install is used instead of npm ci so a pre-existing lockfile is not required.
# Once you have committed package-lock.json you can switch back to npm ci for faster, reproducible installs.
RUN npm install --ignore-scripts

# ③ Copy the rest of the source
COPY . .

# ④ Accept optional VITE_ build-time env vars via --build-arg
#    These are baked into the JS bundle at build time by Vite.
ARG VITE_MARKET_API_URL=""
ARG VITE_MARKET_API_KEY=""
ARG VITE_API_BASE_URL=""
ENV VITE_MARKET_API_URL=$VITE_MARKET_API_URL \
    VITE_MARKET_API_KEY=$VITE_MARKET_API_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

# ⑤ Type-check + build
RUN npm run build

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove the default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy Nginx config (SPA fallback + compression + security headers)
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx runs as root by default; drop to a non-root user for security
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

# Healthcheck — Nginx responds with 200 on /
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:80/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
