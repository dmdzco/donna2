"""Donna Pipecat — FastAPI server entry point.

Serves:
- /health — health check
- /voice/answer — Twilio voice webhook (TwiML)
- /voice/status — Twilio status callback
- /ws — WebSocket endpoint for Pipecat voice pipeline
- /api/call — outbound call initiation
- /api/calls — active call listing (admin)
"""

from __future__ import annotations

import asyncio
import os
import sys
import warnings

from loguru import logger

# Configure log level: INFO in production, DEBUG locally
_log_level = os.getenv("LOG_LEVEL", "INFO" if os.getenv("RAILWAY_PUBLIC_DOMAIN") else "DEBUG")
logger.remove()
logger.add(sys.stderr, level=_log_level)

# Route Python warnings through loguru instead of raw stderr.
# This gives them a proper @level tag in Railway so they can be filtered.
# DeprecationWarnings → DEBUG (hidden at INFO), other warnings → WARNING.
def _warning_handler(message, category, filename, lineno, file=None, line=None):
    if issubclass(category, DeprecationWarning):
        logger.debug("{msg}", msg=str(message))
    else:
        logger.warning("{cat}: {msg}", cat=category.__name__, msg=str(message))

warnings.showwarning = _warning_handler

# Sentry error monitoring (before FastAPI import for auto-instrumentation)
try:
    import sentry_sdk
    _sentry_dsn = os.getenv("SENTRY_DSN", "")
    if _sentry_dsn:
        sentry_sdk.init(
            dsn=_sentry_dsn,
            traces_sample_rate=0,
            send_default_pii=False,
            environment="production" if os.getenv("RAILWAY_PUBLIC_DOMAIN") else "development",
        )
        logger.info("Sentry initialized")
except ImportError:
    pass

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from api.middleware.error_handler import register_error_handlers
from api.middleware.rate_limit import limiter
from api.middleware.security import SecurityHeadersMiddleware
from api.routes.calls import router as calls_router
from api.routes.voice import router as voice_router, call_metadata
from bot import run_bot

app = FastAPI(title="Donna Pipecat", version="0.1.0")

# ---------------------------------------------------------------------------
# Active call tracking for graceful shutdown
# ---------------------------------------------------------------------------
_active_tasks: set[asyncio.Task] = set()
_shutting_down = False


def is_shutting_down() -> bool:
    """Check if the server is in shutdown mode."""
    return _shutting_down


def register_call_task(task: asyncio.Task) -> None:
    """Track an active call task for graceful shutdown draining."""
    _active_tasks.add(task)
    task.add_done_callback(_active_tasks.discard)

# ---------------------------------------------------------------------------
# Middleware (order matters — outermost first)
# ---------------------------------------------------------------------------

# Security headers (HSTS, X-Frame-Options, etc.)
app.add_middleware(SecurityHeadersMiddleware)

# CORS
ALLOWED_ORIGINS = [
    "https://admin-v2-liart.vercel.app",
    os.getenv("ADMIN_URL", ""),
]
if not os.getenv("RAILWAY_PUBLIC_DOMAIN"):
    ALLOWED_ORIGINS.extend(["http://localhost:5173", "http://localhost:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Error handlers
register_error_handlers(app)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
app.include_router(voice_router)
app.include_router(calls_router)


@app.get("/health")
async def health():
    """Health check endpoint with service status."""
    from db import check_health as db_health
    from lib.circuit_breaker import get_breaker_states

    db_ok = await db_health()
    breakers = get_breaker_states()
    status = "ok" if db_ok else "degraded"

    return {
        "status": status,
        "service": "donna-pipecat",
        "active_calls": len(call_metadata),
        "database": "ok" if db_ok else "error",
        "circuit_breakers": breakers,
    }


# ---------------------------------------------------------------------------
# WebSocket — Pipecat voice pipeline
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Twilio connects here via TwiML <Stream>. Runs the Pipecat pipeline."""
    await websocket.accept()

    # Track this task for graceful shutdown draining
    current_task = asyncio.current_task()
    if current_task:
        register_call_task(current_task)

    session_state = {
        "senior_id": None,
        "senior": None,
        "memory_context": None,
        "news_context": None,
        "greeting": None,
        "reminder_prompt": None,
        "reminder_delivery": None,
        "reminders_delivered": set(),
        "conversation_id": None,
        "call_sid": None,
        "call_type": "check-in",
        "is_outbound": True,
        "previous_calls_summary": None,
        "todays_context": None,
        "_transcript": [],
        "_call_metadata": call_metadata,
    }

    try:
        import sentry_sdk as _sentry
        _sentry.set_tag("senior_id", session_state.get("senior_id", "unknown"))
        _sentry.set_tag("call_type", session_state.get("call_type", "unknown"))
    except ImportError:
        pass

    try:
        await run_bot(websocket, session_state)
    except Exception as e:
        logger.error("Pipeline error: {err}", err=str(e))
        try:
            import sentry_sdk as _sentry
            _sentry.capture_exception(e)
        except ImportError:
            pass
    finally:
        # Clean up call_metadata to prevent memory leaks on crashes
        cs = session_state.get("call_sid")
        if cs:
            call_metadata.pop(cs, None)
        if websocket.client_state.name != "DISCONNECTED":
            try:
                await websocket.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Startup / Shutdown
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    port = os.getenv("PORT", "7860")
    logger.info("Donna Pipecat starting on port {port}", port=port)

    # Initialize database pool
    try:
        from db import get_pool
        await get_pool()
        logger.info("Database pool initialized")
    except Exception as e:
        logger.error("Database init failed: {err}", err=str(e))

    # Load feature flags into memory cache
    try:
        from lib.feature_flags import refresh_flags
        await refresh_flags()
    except Exception as e:
        logger.warning("Feature flags init failed (table may not exist yet): {err}", err=str(e))

    # Start scheduler ONLY if explicitly enabled (prevents dual-scheduler conflict)
    scheduler_enabled = os.getenv("SCHEDULER_ENABLED", "false").lower() == "true"
    base_url = os.getenv("BASE_URL", "")
    if scheduler_enabled and base_url:
        from services.scheduler import start_scheduler
        asyncio.create_task(start_scheduler(base_url))
        logger.info("Scheduler started")
    else:
        logger.info(
            "Scheduler disabled (SCHEDULER_ENABLED={se}, BASE_URL={bu})",
            se=os.getenv("SCHEDULER_ENABLED", "false"),
            bu="set" if base_url else "unset",
        )


@app.on_event("shutdown")
async def shutdown():
    global _shutting_down
    _shutting_down = True
    logger.info("Shutdown: draining {n} active calls", n=len(_active_tasks))

    if _active_tasks:
        # Give active calls up to 7 seconds to finish (Railway gives 10s)
        done, pending = await asyncio.wait(list(_active_tasks), timeout=7.0)
        if pending:
            logger.warning("Shutdown: {n} calls didn't finish, cancelling", n=len(pending))
            for t in pending:
                t.cancel()
            await asyncio.wait(pending, timeout=2.0)

    # Close DB pool last
    try:
        from db import close_pool
        await close_pool()
        logger.info("Database pool closed")
    except Exception as e:
        logger.error("Database shutdown error: {err}", err=str(e))
