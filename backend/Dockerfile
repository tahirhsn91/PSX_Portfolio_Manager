# =============================================================================
# PSX Portfolio Manager — Market Data Proxy Dockerfile
#
# Lightweight Node.js 20 Alpine image running the Express proxy server.
# The proxy adds the Capital Stake Bearer token to all upstream API calls
# so the key is never exposed to the browser.
#
# Uses Yahoo Finance public API (no key needed) via node-fetch with browser headers.
# Build: docker build -t psx-proxy ./backend
# =============================================================================

FROM node:20-alpine

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./
COPY providers/ ./providers/
COPY db/ ./db/
COPY middleware/ ./middleware/
COPY routes/ ./routes/

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1

CMD ["node", "index.js"]
