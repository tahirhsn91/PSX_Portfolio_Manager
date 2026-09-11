# =============================================================================
# PSX Portfolio Manager — Makefile shortcuts
#
# Requires: Docker Desktop with Compose V2  (docker compose)
# Usage   : make <target>
# =============================================================================

.PHONY: help dev prod build-prod stop clean logs shell

# ── Default target ─────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  PSX Portfolio Manager — Docker commands"
	@echo ""
	@echo "  make dev          Start dev server + proxy  (React HMR: http://localhost:3000)"
	@echo "  make prod         Build & start production  (Nginx on http://localhost:80)"
	@echo "  make build-prod   Build production image only (no start)"
	@echo "  make stop         Stop all running services"
	@echo "  make clean        Stop + remove containers, volumes, and images"
	@echo "  make logs         Follow logs for the running service"
	@echo "  make logs-proxy   Follow proxy logs"
	@echo "  make shell        Open a shell in the running dev container"
	@echo "  make proxy-health Check if the market data proxy is healthy"
	@echo ""
	@echo "  Live data setup (free — Yahoo Finance, no API key):"
	@echo "    1. cp .env.example .env.local"
	@echo "    2. Set VITE_MARKET_PROVIDER=yahoo"
	@echo "    3. make dev"
	@echo ""
	@echo "  Live data setup (paid — Capital Stake):"
	@echo "    1. cp .env.example .env.local"
	@echo "    2. Set CAPITALSTAKE_API_KEY and VITE_MARKET_PROVIDER=capitalstake"
	@echo "    3. make dev"
	@echo ""

# ── Development ───────────────────────────────────────────────────────────
dev:
	docker compose --profile dev up --build

dev-detach:
	docker compose --profile dev up --build -d

# ── Production ────────────────────────────────────────────────────────────
prod:
	docker compose --profile prod up --build

prod-detach:
	docker compose --profile prod up --build -d

build-prod:
	docker compose --profile prod build

# ── Control ───────────────────────────────────────────────────────────────
stop:
	docker compose --profile dev  down
	docker compose --profile prod down

clean:
	docker compose --profile dev  down --volumes --rmi local
	docker compose --profile prod down --volumes --rmi local

# ── Observability ─────────────────────────────────────────────────────────
logs:
	docker compose logs -f

logs-dev:
	docker compose --profile dev logs -f app-dev

logs-prod:
	docker compose --profile prod logs -f app-prod

logs-proxy:
	docker compose --profile dev logs -f proxy-dev

# ── Proxy ─────────────────────────────────────────────────────────────────
proxy-health:
	curl -s http://localhost:4000/health | python3 -m json.tool

# ── Debug ─────────────────────────────────────────────────────────────────
shell:
	docker compose --profile dev exec app-dev sh

shell-proxy:
	docker compose --profile dev exec proxy-dev sh

shell-prod:
	docker compose --profile prod exec app-prod sh
