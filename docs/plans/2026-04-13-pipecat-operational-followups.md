# Pipecat Operational Follow-ups

Observed while validating `codex/conversation-pipeline-fixes` on April 13, 2026.

## Follow-ups

- [x] Use shared state in Pipecat dev when a Redis endpoint is valid. `REDIS_URL` is still supported, and the code can use `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` when `REDIS_URL` is absent. During validation, the checked Railway Upstash URL returned DNS `NXDOMAIN`; `UpstashRestState` now temporarily disables itself after HTTP/DNS failure so single-replica dev falls back to local state instead of repeatedly treating a dead endpoint as shared. A valid Redis/Upstash endpoint is still required before scaling beyond one Pipecat replica.
- [x] Fix data-retention purge SQL warnings around `LIMIT` in both Python and Node retention jobs by deleting from a limited `ctid` batch CTE.
- [x] Update Railway Makefile/helper commands that assumed the old `railway variables get` / `railway variables set` CLI behavior.
- [x] Make local simulation fixture integration tests auto-skip when `DATABASE_URL` is absent or unreachable.

## Dev Redis Provisioning

Completed April 14, 2026:

- Created Railway Redis service `Redis` in the `donna` project `dev` environment.
- Set `donna-pipecat` dev `REDIS_URL` to `${{Redis.REDIS_URL}}`.
- Redeployed `donna-pipecat` dev as deployment `d8c88c67-f76c-45f4-9f85-3e444f72e50b`.
- Verified `Redis`, `donna-pipecat`, and `donna-api` were all `SUCCESS`.
- Verified `make health-dev` returned healthy Pipecat and Node responses.
- Verified Redis from inside the Pipecat dev container with a non-PHI `codex:redis-smoke:*` key: selected `RedisState`, `is_shared=True`, set/get matched, and delete was confirmed.
- Left stale Upstash variables in place for now. `REDIS_URL` takes precedence, but `UPSTASH_REDIS_REST_URL` should be removed after one successful dev call validation to avoid future confusion.

Note: `REDIS_URL` resolves to Railway private networking (`redis.railway.internal`), so local `railway run` commands cannot prove Redis connectivity from a developer machine. Use `railway ssh --service donna-pipecat --environment dev ...` when the smoke test needs private-network access.
