#!/usr/bin/env bash
# Production rollout script for Donna scalability.
#
# Gradually onboards users in cohorts while monitoring health.
# Each cohort increase is gated on health checks passing.
#
# Usage:
#   cd pipecat
#   bash scripts/rollout.sh [cohort_size]
#
# Cohorts: 500 → 1000 → 2000 → 4000 → 8000

set -euo pipefail

PROD_URL="${DONNA_PROD_URL:-https://donna-pipecat-production.up.railway.app}"
ADMIN_URL="${DONNA_ADMIN_URL:-https://donna-api-production.up.railway.app}"
COHORT="${1:-500}"
MONITOR_DURATION="${MONITOR_DURATION:-300}"  # 5 minutes between cohorts

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $*"; }
err() { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $*" >&2; }

check_health() {
    local resp
    resp=$(curl -sf --max-time 10 "$PROD_URL/health" 2>/dev/null || echo '{"status":"unreachable"}')
    local status
    status=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null || echo "error")
    local calls
    calls=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('active_calls',0))" 2>/dev/null || echo "0")
    local db
    db=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('database','unknown'))" 2>/dev/null || echo "unknown")

    echo "$status|$calls|$db"
}

wait_healthy() {
    local label="$1"
    local max_checks=12  # 60 seconds max
    local check=0

    while [ $check -lt $max_checks ]; do
        IFS='|' read -r status calls db <<< "$(check_health)"
        if [ "$status" = "ok" ] && [ "$db" = "ok" ]; then
            log "$label: healthy (active_calls=$calls)"
            return 0
        fi
        warn "$label: waiting for health (status=$status, db=$db)..."
        sleep 5
        check=$((check + 1))
    done

    err "$label: health check failed after 60s"
    return 1
}

monitor_period() {
    local duration="$1"
    local label="$2"
    local interval=30
    local checks=$((duration / interval))
    local failures=0

    log "Monitoring for ${duration}s ($label)..."
    for i in $(seq 1 $checks); do
        IFS='|' read -r status calls db <<< "$(check_health)"
        if [ "$status" != "ok" ]; then
            failures=$((failures + 1))
            warn "Health check failed ($failures): status=$status calls=$calls db=$db"
        else
            printf "\r  [%d/%d] status=ok calls=%s db=%s    " "$i" "$checks" "$calls" "$db"
        fi

        if [ $failures -ge 3 ]; then
            echo ""
            err "3+ consecutive health failures — ABORT ROLLOUT"
            err "Current state: status=$status calls=$calls db=$db"
            err "Action: Check Railway logs, consider rollback"
            exit 1
        fi

        sleep $interval
    done
    echo ""
    log "Monitoring complete ($label): $failures failures in ${duration}s"
}

# --- Alert thresholds ---
check_alerts() {
    local resp
    resp=$(curl -sf --max-time 10 "$PROD_URL/health" 2>/dev/null || echo '{}')

    local calls
    calls=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('active_calls',0))" 2>/dev/null || echo "0")
    local max_calls
    max_calls=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('max_calls',50))" 2>/dev/null || echo "50")

    # Alert: approaching capacity (>80%)
    local threshold=$((max_calls * 80 / 100))
    if [ "$calls" -gt "$threshold" ] 2>/dev/null; then
        warn "ALERT: Active calls ($calls) > 80% of capacity ($max_calls)"
    fi

    # Alert: circuit breakers
    local breakers
    breakers=$(echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('circuit_breakers', {})
open_breakers = [k for k, v in d.items() if v != 'closed']
print(','.join(open_breakers) if open_breakers else '')
" 2>/dev/null || echo "")

    if [ -n "$breakers" ]; then
        warn "ALERT: Circuit breakers OPEN: $breakers"
    fi
}

# --- Main ---
log "Donna Scalability Rollout"
log "Target: $PROD_URL"
log "Starting cohort: $COHORT users"
echo ""

# Pre-flight
if ! wait_healthy "Pre-flight"; then
    err "Server not healthy — cannot start rollout"
    exit 1
fi

COHORTS=(500 1000 2000 4000 8000)
started=false

for size in "${COHORTS[@]}"; do
    if [ "$size" -lt "$COHORT" ]; then
        continue
    fi
    started=true

    log "=========================================="
    log "COHORT: $size users"
    log "=========================================="

    # In a real rollout, this would update the user count in the database
    # or enable a feature flag for the next batch of users.
    log "Action: Enable calling for the next batch (total: $size users)"
    log "Verify the user cohort is configured, then press Enter to continue..."
    read -r

    # Monitor
    monitor_period "$MONITOR_DURATION" "cohort-$size"
    check_alerts

    log "Cohort $size: PASSED"
    echo ""
done

if [ "$started" = false ]; then
    warn "No cohorts to process (starting cohort $COHORT exceeds max)"
fi

log "Rollout complete!"
