## Summary

<!-- Brief description of the changes (1-3 sentences) -->

## Changes

<!-- Bullet list of what changed -->

-

## Test Plan

- [ ] Unit tests pass (`cd pipecat && uv run python -m pytest tests/ -m "not integration and not llm and not llm_simulation" --tb=short -q`)
- [ ] Regression scenarios pass (`cd pipecat && uv run python -m pytest tests/ -m regression -v`)
- [ ] Node.js tests pass (`npm test`)
- [ ] Tested with a real phone call on Railway (if voice pipeline changed)

## Checklist

- [ ] I have read `DIRECTORY.md` and `CLAUDE.md`
- [ ] No secrets or PII committed
- [ ] Documentation updated (if applicable)
