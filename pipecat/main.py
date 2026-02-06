"""Donna Pipecat — FastAPI server entry point.

Serves:
- /health — health check
- /voice/answer — Twilio voice webhook (TwiML)
- /voice/status — Twilio status callback
- /ws — WebSocket endpoint for Pipecat voice pipeline
"""

from __future__ import annotations

import asyncio
import os

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from api.routes.voice import router as voice_router, call_metadata

app = FastAPI(title="Donna Pipecat", version="0.1.0")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    "https://admin-v2-liart.vercel.app",
    os.getenv("ADMIN_URL", ""),
]
# In dev, allow localhost origins
if not os.getenv("RAILWAY_PUBLIC_DOMAIN"):
    ALLOWED_ORIGINS.extend(["http://localhost:5173", "http://localhost:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
app.include_router(voice_router)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "donna-pipecat",
        "active_calls": len(call_metadata),
    }


# ---------------------------------------------------------------------------
# WebSocket — Pipecat voice pipeline
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Twilio connects here via TwiML <Stream>. Runs the Pipecat pipeline."""
    await websocket.accept()

    # Import here to avoid circular imports and heavy module loading at startup
    from bot import run_bot

    # Build session state from call metadata
    # The call_sid comes via the Twilio WebSocket 'start' message,
    # but we can also get custom parameters from the TwiML <Parameter> tags
    # which arrive in the WebSocket handshake body
    session_state = {
        "senior_id": None,
        "senior": None,
        "memory_context": None,
        "greeting": None,
        "reminder_prompt": None,
        "reminder_delivery": None,
        "reminders_delivered": set(),
        "conversation_id": None,
        "call_sid": None,
        "call_type": "check-in",
        "previous_calls_summary": None,
        "todays_context": None,
        "_transcript": [],
    }

    # We'll populate session_state from call_metadata once we know the call_sid.
    # The bot.py's parse_telephony_websocket extracts custom parameters from the
    # WebSocket handshake which includes the TwiML <Parameter> values.
    # After that, we can look up call_metadata by call_sid.

    # For now, pass a callback to populate from metadata
    session_state["_call_metadata"] = call_metadata

    try:
        await run_bot(websocket, session_state)
    except Exception as e:
        logger.error("Pipeline error: {err}", err=str(e))
    finally:
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
    logger.info("Donna Pipecat starting on port {port}", port=os.getenv("PORT", "7860"))

    # Initialize database pool
    try:
        from db import get_pool
        await get_pool()
        logger.info("Database pool initialized")
    except Exception as e:
        logger.error("Database init failed: {err}", err=str(e))

    # Start scheduler (if enabled)
    base_url = os.getenv("BASE_URL", "")
    if base_url:
        from services.scheduler import start_scheduler
        asyncio.create_task(start_scheduler(base_url))


@app.on_event("shutdown")
async def shutdown():
    logger.info("Donna Pipecat shutting down")
    try:
        from db import close_pool
        await close_pool()
        logger.info("Database pool closed")
    except Exception as e:
        logger.error("Database shutdown error: {err}", err=str(e))
