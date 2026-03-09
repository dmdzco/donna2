#!/usr/bin/env bash
# Continuous health monitor for Donna during load tests.
#
# Polls /health every N seconds and logs metrics to CSV.
# Run alongside load tests to track active_calls, pool stats, etc.
#
# Usage:
#   bash tests/load/monitor_health.sh [interval_seconds] [output_file]

set -euo pipefail

HOST="${LOAD_TEST_HOST:-https://donna-pipecat-production.up.railway.app}"
INTERVAL="${1:-5}"
OUTPUT="${2:-health_monitor_$(date +%Y%m%d-%H%M%S).csv}"

echo "timestamp,status,active_calls,database,circuit_breakers" > "$OUTPUT"
echo "Monitoring $HOST/health every ${INTERVAL}s → $OUTPUT"
echo "Press Ctrl+C to stop"

while true; do
    TS=$(date +%Y-%m-%dT%H:%M:%S)
    RESP=$(curl -sf --max-time 5 "$HOST/health" 2>/dev/null || echo '{"status":"unreachable","active_calls":-1,"database":"unknown"}')

    STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null || echo "error")
    CALLS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('active_calls',-1))" 2>/dev/null || echo "-1")
    DB=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('database','unknown'))" 2>/dev/null || echo "unknown")
    CB=$(echo "$RESP" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('circuit_breakers',{})))" 2>/dev/null || echo "{}")

    echo "$TS,$STATUS,$CALLS,$DB,\"$CB\"" >> "$OUTPUT"
    printf "\r[%s] status=%s calls=%s db=%s" "$TS" "$STATUS" "$CALLS" "$DB"

    sleep "$INTERVAL"
done
