"""Centralized error handler.

Port of middleware/error-handler.js — consistent error responses,
never leaks internal details to clients.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger


def register_error_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(Exception)
    async def global_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = request.headers.get("x-request-id", "no-id")
        logger.error("[{rid}] Unhandled error: {err}", rid=request_id, err=str(exc))

        # Don't leak internal details
        return JSONResponse(
            status_code=500,
            content={"error": "An internal error occurred"},
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"error": str(exc)},
        )
