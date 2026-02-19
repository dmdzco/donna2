#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────
# Donna — One-time environment setup
#
# Creates:
#   1. Neon database branches (dev + staging)
#   2. Railway "dev" environment with all env vars
#
# Prerequisites:
#   - neonctl (brew install neonctl)
#   - railway CLI (npm install -g @railway/cli)
#   - Both CLIs authenticated (neonctl auth, railway login)
#
# Usage:
#   bash scripts/setup-environments.sh
# ─────────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${BOLD}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ─────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────

echo ""
echo -e "${BOLD}Donna — Environment Setup${NC}"
echo "─────────────────────────────────────────"
echo ""

command -v neonctl >/dev/null 2>&1 || fail "neonctl not found. Run: brew install neonctl"
command -v railway >/dev/null 2>&1 || fail "railway CLI not found. Run: npm install -g @railway/cli"

# Check neonctl auth
if ! neonctl projects list &>/dev/null; then
  warn "neonctl not authenticated. Opening browser..."
  neonctl auth
fi

# Check railway auth
if ! railway status &>/dev/null; then
  warn "Railway CLI not linked. Run: railway link"
  exit 1
fi

# ─────────────────────────────────────────────
# Step 1: Identify Neon project
# ─────────────────────────────────────────────

echo ""
info "Finding your Neon project..."

NEON_PROJECTS=$(neonctl projects list --output json 2>/dev/null)
NEON_PROJECT_COUNT=$(echo "$NEON_PROJECTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$NEON_PROJECT_COUNT" = "0" ]; then
  fail "No Neon projects found. Check your neonctl auth."
elif [ "$NEON_PROJECT_COUNT" = "1" ]; then
  NEON_PROJECT_ID=$(echo "$NEON_PROJECTS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
  NEON_PROJECT_NAME=$(echo "$NEON_PROJECTS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['name'])")
  ok "Found Neon project: $NEON_PROJECT_NAME ($NEON_PROJECT_ID)"
else
  echo ""
  echo "Multiple Neon projects found:"
  echo "$NEON_PROJECTS" | python3 -c "
import sys, json
projects = json.load(sys.stdin)
for i, p in enumerate(projects):
    print(f'  {i+1}) {p[\"name\"]} ({p[\"id\"]})')
"
  echo ""
  read -rp "Select project number: " PROJECT_NUM
  NEON_PROJECT_ID=$(echo "$NEON_PROJECTS" | python3 -c "import sys,json; print(json.load(sys.stdin)[int(sys.argv[1])-1]['id'])" "$PROJECT_NUM")
  NEON_PROJECT_NAME=$(echo "$NEON_PROJECTS" | python3 -c "import sys,json; print(json.load(sys.stdin)[int(sys.argv[1])-1]['name'])" "$PROJECT_NUM")
  ok "Selected: $NEON_PROJECT_NAME ($NEON_PROJECT_ID)"
fi

# ─────────────────────────────────────────────
# Step 2: Create Neon branches
# ─────────────────────────────────────────────

echo ""
info "Creating Neon database branches..."

# Check if branches already exist
EXISTING_BRANCHES=$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json 2>/dev/null)

create_branch() {
  local BRANCH_NAME=$1
  local EXISTS=$(echo "$EXISTING_BRANCHES" | python3 -c "
import sys, json
branches = json.load(sys.stdin)
print('yes' if any(b['name'] == '$BRANCH_NAME' for b in branches) else 'no')
" 2>/dev/null)

  if [ "$EXISTS" = "yes" ]; then
    warn "Branch '$BRANCH_NAME' already exists — skipping creation"
  else
    info "Creating branch '$BRANCH_NAME' from main..."
    neonctl branches create --project-id "$NEON_PROJECT_ID" --name "$BRANCH_NAME" --output json >/dev/null
    ok "Created branch: $BRANCH_NAME"
  fi

  # Get connection string
  local CONN_STR
  CONN_STR=$(neonctl connection-string --project-id "$NEON_PROJECT_ID" --branch "$BRANCH_NAME" 2>/dev/null)
  echo "$CONN_STR"
}

DEV_DB_URL=$(create_branch "dev")
STAGING_DB_URL=$(create_branch "staging")

echo ""
ok "Dev DATABASE_URL:     ${DEV_DB_URL:0:50}..."
ok "Staging DATABASE_URL: ${STAGING_DB_URL:0:50}..."

# ─────────────────────────────────────────────
# Step 3: Get configuration from user
# ─────────────────────────────────────────────

echo ""
info "Configuration needed:"
echo ""

read -rp "Dev Twilio phone number (e.g. +1234567890): " DEV_TWILIO_NUMBER
if [ -z "$DEV_TWILIO_NUMBER" ]; then
  fail "Twilio number is required"
fi

# ─────────────────────────────────────────────
# Step 4: Copy production env vars and create dev environment
# ─────────────────────────────────────────────

echo ""
info "Reading production env vars from Railway..."

# Get production vars for each service to replicate
get_prod_var() {
  local SERVICE=$1
  local VAR=$2
  railway variables get "$VAR" --service "$SERVICE" --environment production 2>/dev/null || echo ""
}

# Read key production vars from Pipecat service
ANTHROPIC_API_KEY=$(get_prod_var donna-pipecat ANTHROPIC_API_KEY)
DEEPGRAM_API_KEY=$(get_prod_var donna-pipecat DEEPGRAM_API_KEY)
ELEVENLABS_API_KEY=$(get_prod_var donna-pipecat ELEVENLABS_API_KEY)
ELEVENLABS_VOICE_ID=$(get_prod_var donna-pipecat ELEVENLABS_VOICE_ID)
GOOGLE_API_KEY=$(get_prod_var donna-pipecat GOOGLE_API_KEY)
OPENAI_API_KEY=$(get_prod_var donna-pipecat OPENAI_API_KEY)
TWILIO_ACCOUNT_SID=$(get_prod_var donna-pipecat TWILIO_ACCOUNT_SID)
TWILIO_AUTH_TOKEN=$(get_prod_var donna-pipecat TWILIO_AUTH_TOKEN)
JWT_SECRET=$(get_prod_var donna-pipecat JWT_SECRET)
DONNA_API_KEY=$(get_prod_var donna-pipecat DONNA_API_KEY)

if [ -z "$ANTHROPIC_API_KEY" ]; then
  warn "Could not read production vars. You may need to set vars manually in Railway dashboard."
  warn "The dev environment and Neon branches have been created — set vars in Railway UI."
  echo ""
  echo "Railway env vars to set for dev environment (both services):"
  echo "  DATABASE_URL          = $DEV_DB_URL"
  echo "  TWILIO_PHONE_NUMBER   = $DEV_TWILIO_NUMBER"
  echo "  SCHEDULER_ENABLED     = false   (on donna-pipecat)"
  echo "  SCHEDULER_ENABLED     = true    (on donna-nodejs, if you want reminders)"
  echo "  + copy all API keys from production"
  echo ""
  echo "For staging environment:"
  echo "  DATABASE_URL          = $STAGING_DB_URL"
  echo "  + same API keys and Twilio dev number"
  echo ""
  ok "Neon branches created. Set Railway vars manually, then run: make deploy-dev"
  exit 0
fi

ok "Read production env vars"

# ─────────────────────────────────────────────
# Step 5: Set dev environment variables
# ─────────────────────────────────────────────

echo ""
info "Setting env vars for dev environment..."

set_dev_var() {
  local SERVICE=$1
  local KEY=$2
  local VALUE=$3
  if [ -n "$VALUE" ]; then
    railway variables set "$KEY=$VALUE" --service "$SERVICE" --environment dev 2>/dev/null && \
      echo "  Set $KEY on $SERVICE" || \
      warn "Failed to set $KEY on $SERVICE"
  fi
}

# Pipecat dev vars
info "Setting donna-pipecat dev vars..."
set_dev_var donna-pipecat DATABASE_URL "$DEV_DB_URL"
set_dev_var donna-pipecat TWILIO_ACCOUNT_SID "$TWILIO_ACCOUNT_SID"
set_dev_var donna-pipecat TWILIO_AUTH_TOKEN "$TWILIO_AUTH_TOKEN"
set_dev_var donna-pipecat TWILIO_PHONE_NUMBER "$DEV_TWILIO_NUMBER"
set_dev_var donna-pipecat ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
set_dev_var donna-pipecat DEEPGRAM_API_KEY "$DEEPGRAM_API_KEY"
set_dev_var donna-pipecat ELEVENLABS_API_KEY "$ELEVENLABS_API_KEY"
set_dev_var donna-pipecat ELEVENLABS_VOICE_ID "$ELEVENLABS_VOICE_ID"
set_dev_var donna-pipecat GOOGLE_API_KEY "$GOOGLE_API_KEY"
set_dev_var donna-pipecat OPENAI_API_KEY "$OPENAI_API_KEY"
set_dev_var donna-pipecat JWT_SECRET "$JWT_SECRET"
set_dev_var donna-pipecat DONNA_API_KEY "$DONNA_API_KEY"
set_dev_var donna-pipecat SCHEDULER_ENABLED "false"
set_dev_var donna-pipecat LOG_LEVEL "DEBUG"

# Node.js dev vars
info "Setting donna-nodejs dev vars..."
set_dev_var donna-nodejs DATABASE_URL "$DEV_DB_URL"
set_dev_var donna-nodejs TWILIO_ACCOUNT_SID "$TWILIO_ACCOUNT_SID"
set_dev_var donna-nodejs TWILIO_AUTH_TOKEN "$TWILIO_AUTH_TOKEN"
set_dev_var donna-nodejs TWILIO_PHONE_NUMBER "$DEV_TWILIO_NUMBER"
set_dev_var donna-nodejs GOOGLE_API_KEY "$GOOGLE_API_KEY"
set_dev_var donna-nodejs OPENAI_API_KEY "$OPENAI_API_KEY"
set_dev_var donna-nodejs JWT_SECRET "$JWT_SECRET"
set_dev_var donna-nodejs DONNA_API_KEY "$DONNA_API_KEY"

# ─────────────────────────────────────────────
# Step 6: Set staging environment variables
# ─────────────────────────────────────────────

echo ""
info "Setting staging env vars..."

set_staging_var() {
  local SERVICE=$1
  local KEY=$2
  local VALUE=$3
  if [ -n "$VALUE" ]; then
    railway variables set "$KEY=$VALUE" --service "$SERVICE" --environment staging 2>/dev/null && \
      echo "  Set $KEY on $SERVICE" || \
      warn "Failed to set $KEY on $SERVICE"
  fi
}

set_staging_var donna-pipecat DATABASE_URL "$STAGING_DB_URL"
set_staging_var donna-pipecat TWILIO_PHONE_NUMBER "$DEV_TWILIO_NUMBER"
set_staging_var donna-nodejs DATABASE_URL "$STAGING_DB_URL"
set_staging_var donna-nodejs TWILIO_PHONE_NUMBER "$DEV_TWILIO_NUMBER"

# ─────────────────────────────────────────────
# Step 7: Summary
# ─────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────"
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo "─────────────────────────────────────────"
echo ""
echo "Environments created:"
echo "  production  → Neon main branch (unchanged)"
echo "  staging     → Neon 'staging' branch"
echo "  dev         → Neon 'dev' branch"
echo ""
echo "Next steps:"
echo ""
echo "  1. Configure Twilio webhook for dev number ($DEV_TWILIO_NUMBER):"
echo "     Voice URL → https://<dev-pipecat-domain>/voice/answer"
echo "     (Get domain after first deploy: make deploy-dev)"
echo ""
echo "  2. Deploy to dev:"
echo "     make deploy-dev"
echo ""
echo "  3. Seed dev database (copy a test senior from prod):"
echo "     You can use the admin dashboard or insert directly"
echo ""
echo "  4. Test with a real call to $DEV_TWILIO_NUMBER"
echo ""
echo "  5. Iterate: edit → make deploy-dev-pipecat → call → repeat"
echo ""
echo "Commands:"
echo "  make deploy-dev          Deploy to dev"
echo "  make deploy-dev-pipecat  Deploy only Pipecat to dev (faster)"
echo "  make health-dev          Check dev services are up"
echo "  make logs-dev            Tail dev logs"
echo "  make test                Run all tests locally"
echo ""
