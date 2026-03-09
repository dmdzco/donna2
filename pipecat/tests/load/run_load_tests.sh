#!/usr/bin/env bash
# Load test runner for Donna scalability validation.
#
# Runs all Phase 6 load test scenarios against a target host.
# Designed to run from a cloud VM in the same region as Railway.
#
# Prerequisites:
#   - Python 3.12+ and uv installed
#   - LOAD_TEST_DB_URL set (Neon staging branch)
#   - Target server running with LOAD_TEST_MODE=true
#
# Usage:
#   cd pipecat
#   export LOAD_TEST_DB_URL=postgresql://...
#   export LOAD_TEST_HOST=https://donna-pipecat-staging.up.railway.app
#   bash tests/load/run_load_tests.sh [scenario]
#
# Scenarios:
#   baseline    - 50 concurrent, 2 minutes (pre-optimization measurement)
#   target      - 500 concurrent, 10 minutes (must-pass)
#   stress      - 2000 concurrent, 10 minutes (find breaking point)
#   soak        - Variable load, 8 hours (memory leak detection)
#   spike       - Morning spike simulation (4800 reminders in 2hr window)
#   db          - Database-only load test (no server needed)
#   all         - Run baseline → target → stress → db (skip soak)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPECAT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$PIPECAT_DIR/tests/load/results/$(date +%Y%m%d-%H%M%S)"

HOST="${LOAD_TEST_HOST:-https://donna-pipecat-staging.up.railway.app}"
DB_URL="${LOAD_TEST_DB_URL:-${DATABASE_URL:-}}"
SCENARIO="${1:-all}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $*"; }
err() { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $*" >&2; }

# --- Preflight checks ---
preflight() {
    log "Preflight checks..."
    mkdir -p "$RESULTS_DIR"

    if ! command -v uv &>/dev/null; then
        err "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi

    if [ -z "$DB_URL" ]; then
        warn "LOAD_TEST_DB_URL not set — DB tests will be skipped"
    fi

    # Check target health
    log "Checking target: $HOST/health"
    HEALTH=$(curl -sf "$HOST/health" 2>/dev/null || echo '{"status":"unreachable"}')
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

    if echo "$HEALTH" | grep -q '"status": "ok"'; then
        log "Target is healthy"
    else
        err "Target is not healthy. Deploy with LOAD_TEST_MODE=true first."
        exit 1
    fi

    log "Results will be saved to: $RESULTS_DIR"
}

# --- Health snapshot ---
snapshot_health() {
    local label="$1"
    curl -sf "$HOST/health" > "$RESULTS_DIR/health_${label}.json" 2>/dev/null || true
    log "Health snapshot: $label"
}

# --- Run a Locust scenario ---
run_locust() {
    local name="$1"
    local file="$2"
    local users="$3"
    local rate="$4"
    local duration="$5"
    local extra="${6:-}"

    log "=== Starting: $name ($users users, ramp $rate/s, ${duration}) ==="
    snapshot_health "before_${name}"

    local csv_prefix="$RESULTS_DIR/${name}"

    cd "$PIPECAT_DIR"
    uv run locust \
        -f "$file" \
        --host="$HOST" \
        --headless \
        -u "$users" \
        -r "$rate" \
        -t "$duration" \
        --csv="$csv_prefix" \
        --html="$csv_prefix.html" \
        $extra \
        2>&1 | tee "$RESULTS_DIR/${name}.log"

    snapshot_health "after_${name}"
    log "=== Completed: $name ==="
    echo ""
}

# --- Run DB load test ---
run_db() {
    local name="$1"
    local users="$2"
    local rate="$3"
    local duration="$4"

    if [ -z "$DB_URL" ]; then
        warn "Skipping DB test — no LOAD_TEST_DB_URL"
        return
    fi

    log "=== Starting: $name (DB, $users users, ${duration}) ==="

    cd "$PIPECAT_DIR"
    LOAD_TEST_DB_URL="$DB_URL" DATABASE_URL="$DB_URL" \
    uv run locust \
        -f tests/load/locustfile_db.py \
        --headless \
        -u "$users" \
        -r "$rate" \
        -t "$duration" \
        --csv="$RESULTS_DIR/${name}" \
        --html="$RESULTS_DIR/${name}.html" \
        2>&1 | tee "$RESULTS_DIR/${name}.log"

    log "=== Completed: $name ==="
}

# --- Run scheduler throughput test ---
run_scheduler() {
    local count="${1:-500}"

    if [ -z "$DB_URL" ]; then
        warn "Skipping scheduler test — no LOAD_TEST_DB_URL"
        return
    fi

    log "=== Starting: scheduler throughput ($count reminders) ==="

    cd "$PIPECAT_DIR"
    LOAD_TEST_DB_URL="$DB_URL" DATABASE_URL="$DB_URL" \
    uv run python tests/load/locustfile_scheduler.py "$count" \
        2>&1 | tee "$RESULTS_DIR/scheduler_${count}.log"

    log "=== Completed: scheduler throughput ==="
}

# --- Scenarios ---
scenario_baseline() {
    log "SCENARIO: Baseline (pre-optimization measurement)"
    run_db "db_baseline" 50 10 "60s"
    run_locust "ws_baseline" "tests/load/locustfile_ws.py" 50 5 "120s"
    run_scheduler 100
}

scenario_target() {
    log "SCENARIO: Target (500 concurrent — must pass)"
    run_db "db_500" 500 50 "120s"
    run_locust "ws_500" "tests/load/locustfile_ws.py" 500 50 "600s"
    run_scheduler 500
}

scenario_stress() {
    log "SCENARIO: Stress test (2000 concurrent — find breaking point)"
    run_locust "ws_2000" "tests/load/locustfile_ws.py" 2000 100 "600s"
    run_db "db_2000" 2000 100 "120s"
}

scenario_soak() {
    log "SCENARIO: Soak test (8 hours, variable load)"
    # Morning spike: 500 concurrent for 2 hours
    run_locust "soak_morning" "tests/load/locustfile_ws.py" 500 50 "7200s"
    # Midday steady: 50 concurrent for 4 hours
    run_locust "soak_midday" "tests/load/locustfile_ws.py" 50 10 "14400s"
    # Evening: 100 concurrent for 2 hours
    run_locust "soak_evening" "tests/load/locustfile_ws.py" 100 20 "7200s"
}

scenario_spike() {
    log "SCENARIO: Morning spike (scheduler throughput)"
    run_scheduler 2000
    run_scheduler 4800
}

scenario_db() {
    log "SCENARIO: Database-only tests"
    run_db "db_100" 100 10 "60s"
    run_db "db_250" 250 25 "60s"
    run_db "db_500" 500 50 "60s"
    run_db "db_1000" 1000 100 "60s"
    run_scheduler 100
    run_scheduler 500
    run_scheduler 2000
}

scenario_all() {
    log "SCENARIO: Full test suite (baseline → target → stress → db)"
    scenario_baseline
    scenario_target
    scenario_stress
    scenario_db
    scenario_spike
}

# --- Main ---
preflight

case "$SCENARIO" in
    baseline) scenario_baseline ;;
    target)   scenario_target ;;
    stress)   scenario_stress ;;
    soak)     scenario_soak ;;
    spike)    scenario_spike ;;
    db)       scenario_db ;;
    all)      scenario_all ;;
    *)
        err "Unknown scenario: $SCENARIO"
        echo "Available: baseline, target, stress, soak, spike, db, all"
        exit 1
        ;;
esac

log "All tests complete. Results saved to: $RESULTS_DIR"
log "HTML reports:"
ls "$RESULTS_DIR"/*.html 2>/dev/null || echo "  (none)"
