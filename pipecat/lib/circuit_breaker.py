"""Lightweight async circuit breaker with timeout.

Prevents cascading failures when external services (Gemini, OpenAI) are slow
or unavailable. Three states: closed (normal), open (failing, use fallback),
half_open (testing recovery).
"""

from __future__ import annotations

import asyncio
import time

from loguru import logger

# Module-level registry of all breakers for health reporting
_breakers: dict[str, CircuitBreaker] = {}


class CircuitBreaker:
    """Async circuit breaker with configurable timeout and failure threshold."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 60.0,
        call_timeout: float = 10.0,
    ):
        self.name = name
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.call_timeout = call_timeout
        self.state = "closed"  # closed | open | half_open
        self.last_failure_time = 0.0
        _breakers[name] = self

    async def call(self, coro, fallback=None):
        """Execute a coroutine with circuit breaker protection.

        Args:
            coro: Awaitable to execute.
            fallback: Value or callable to return when circuit is open or call fails.
        """
        if self.state == "open":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "half_open"
                logger.info("[CB:{name}] Half-open, testing recovery", name=self.name)
            else:
                logger.warning("[CB:{name}] Circuit open, using fallback", name=self.name)
                # Close the unawaited coroutine to avoid RuntimeWarning
                if hasattr(coro, "close"):
                    coro.close()
                return fallback() if callable(fallback) else fallback

        try:
            result = await asyncio.wait_for(coro, timeout=self.call_timeout)
            if self.state == "half_open":
                self.state = "closed"
                self.failure_count = 0
                logger.info("[CB:{name}] Circuit recovered, closed", name=self.name)
            return result
        except (asyncio.TimeoutError, Exception) as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
                logger.error(
                    "[CB:{name}] Circuit opened after {n} failures: {err}",
                    name=self.name,
                    n=self.failure_count,
                    err=str(e),
                )
            else:
                logger.warning(
                    "[CB:{name}] Failure {n}/{t}: {err}",
                    name=self.name,
                    n=self.failure_count,
                    t=self.failure_threshold,
                    err=str(e),
                )
            return fallback() if callable(fallback) else fallback


def get_breaker_states() -> dict[str, str]:
    """Return current state of all registered circuit breakers."""
    return {name: cb.state for name, cb in _breakers.items()}
