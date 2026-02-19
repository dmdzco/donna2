# Donna — Deploy & Environment Commands
#
# Usage:
#   make deploy-dev          Deploy both services to dev environment
#   make deploy-staging      Deploy both services to staging
#   make deploy-prod         Deploy both services to production
#   make deploy-dev-pipecat  Deploy only Pipecat to dev
#   make health-dev          Health check dev environment
#
# First-time setup:
#   make setup               Run interactive environment setup

.PHONY: help setup deploy-dev deploy-staging deploy-prod \
        deploy-dev-pipecat deploy-dev-nodejs \
        deploy-staging-pipecat deploy-staging-nodejs \
        deploy-prod-pipecat deploy-prod-nodejs \
        health-dev health-staging health-prod \
        test test-python test-node test-regression \
        logs-dev logs-staging

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

setup: ## One-time setup: create Neon branches + Railway dev environment
	@bash scripts/setup-environments.sh

# ──────────────────────────────────────────────
# Deploy — Dev (your iteration environment)
# ──────────────────────────────────────────────

deploy-dev: deploy-dev-pipecat deploy-dev-nodejs ## Deploy both services to dev

deploy-dev-pipecat: ## Deploy Pipecat to dev environment
	cd pipecat && railway up --service donna-pipecat --environment dev

deploy-dev-nodejs: ## Deploy Node.js to dev environment
	railway up --service donna-api --environment dev

# ──────────────────────────────────────────────
# Deploy — Staging (pre-merge validation)
# ──────────────────────────────────────────────

deploy-staging: deploy-staging-pipecat deploy-staging-nodejs ## Deploy both services to staging

deploy-staging-pipecat: ## Deploy Pipecat to staging
	cd pipecat && railway up --service donna-pipecat --environment staging

deploy-staging-nodejs: ## Deploy Node.js to staging
	railway up --service donna-api --environment staging

# ──────────────────────────────────────────────
# Deploy — Production (from main branch only)
# ──────────────────────────────────────────────

deploy-prod: deploy-prod-pipecat deploy-prod-nodejs ## Deploy both services to production

deploy-prod-pipecat: ## Deploy Pipecat to production
	cd pipecat && railway up --service donna-pipecat --environment production

deploy-prod-nodejs: ## Deploy Node.js to production
	railway up --service donna-api --environment production

# ──────────────────────────────────────────────
# Health Checks
# ──────────────────────────────────────────────

health-dev: ## Health check dev environment
	@echo "Checking dev Pipecat..."
	@curl -sf "$$(railway variables get RAILWAY_PUBLIC_DOMAIN --service donna-pipecat --environment dev 2>/dev/null | sed 's/^/https:\/\//')"/health && echo " ✓" || echo " ✗ unreachable"
	@echo "Checking dev Node.js..."
	@curl -sf "$$(railway variables get RAILWAY_PUBLIC_DOMAIN --service donna-api --environment dev 2>/dev/null | sed 's/^/https:\/\//')"/health && echo " ✓" || echo " ✗ unreachable"

health-staging: ## Health check staging environment
	@echo "Checking staging Pipecat..."
	@curl -sf "$$(railway variables get RAILWAY_PUBLIC_DOMAIN --service donna-pipecat --environment staging 2>/dev/null | sed 's/^/https:\/\//')"/health && echo " ✓" || echo " ✗ unreachable"
	@echo "Checking staging Node.js..."
	@curl -sf "$$(railway variables get RAILWAY_PUBLIC_DOMAIN --service donna-api --environment staging 2>/dev/null | sed 's/^/https:\/\//')"/health && echo " ✓" || echo " ✗ unreachable"

health-prod: ## Health check production
	@echo "Checking production Pipecat..."
	@curl -sf https://donna-pipecat-production.up.railway.app/health && echo " ✓" || echo " ✗ unreachable"
	@echo "Checking production Node.js..."
	@curl -sf https://donna-api-production-2450.up.railway.app/health && echo " ✓" || echo " ✗ unreachable"

# ──────────────────────────────────────────────
# Tests (local)
# ──────────────────────────────────────────────

test: test-python test-node ## Run all tests

test-python: ## Run Pipecat Python tests
	cd pipecat && uv run python -m pytest tests/ -m "not integration and not llm and not llm_simulation" --tb=short -q

test-node: ## Run Node.js tests
	npm test

test-regression: ## Run regression scenario tests
	cd pipecat && uv run python -m pytest tests/ -m regression --tb=short -q

# ──────────────────────────────────────────────
# Logs
# ──────────────────────────────────────────────

logs-dev: ## Tail dev Pipecat logs
	railway logs --service donna-pipecat --environment dev

logs-staging: ## Tail staging Pipecat logs
	railway logs --service donna-pipecat --environment staging

logs-prod: ## Tail production Pipecat logs
	railway logs --service donna-pipecat --environment production
