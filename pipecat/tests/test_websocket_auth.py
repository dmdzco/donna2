"""Tests for telephony media WebSocket admission."""

import time

import pytest

from api.routes.call_context import call_metadata
from bot import WebSocketAuthError, authenticate_websocket_call


@pytest.fixture(autouse=True)
def clear_call_metadata():
    call_metadata.clear()
    yield
    call_metadata.clear()


@pytest.mark.asyncio
async def test_websocket_auth_rejects_unknown_call_sid():
    with pytest.raises(WebSocketAuthError, match="unknown call_sid"):
        await authenticate_websocket_call(
            {"call_id": "CAunknown", "body": {"ws_token": "token"}},
            {},
        )


@pytest.mark.asyncio
async def test_websocket_auth_rejects_missing_token():
    call_metadata["CA123"] = {
        "ws_token": "expected-token",
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": False,
    }

    with pytest.raises(WebSocketAuthError, match="invalid token"):
        await authenticate_websocket_call({"call_id": "CA123", "body": {}}, {})


@pytest.mark.asyncio
async def test_websocket_auth_rejects_expired_token():
    call_metadata["CA123"] = {
        "ws_token": "expected-token",
        "ws_token_expires_at": time.time() - 1,
        "ws_token_consumed": False,
    }

    with pytest.raises(WebSocketAuthError, match="token expired"):
        await authenticate_websocket_call(
            {"call_id": "CA123", "body": {"ws_token": "expected-token"}},
            {},
        )


@pytest.mark.asyncio
async def test_websocket_auth_rejects_reused_token():
    call_metadata["CA123"] = {
        "ws_token": "expected-token",
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": True,
    }

    with pytest.raises(WebSocketAuthError, match="token already consumed"):
        await authenticate_websocket_call(
            {"call_id": "CA123", "body": {"ws_token": "expected-token"}},
            {},
        )


@pytest.mark.asyncio
async def test_websocket_auth_accepts_valid_token_once():
    call_metadata["CA123"] = {
        "ws_token": "expected-token",
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": False,
    }

    metadata = await authenticate_websocket_call(
        {"call_id": "CA123", "body": {"ws_token": "expected-token"}},
        {},
    )

    assert metadata["ws_token_consumed"] is True
    assert metadata["ws_token_consumed_at"] <= time.time()


@pytest.mark.asyncio
async def test_websocket_auth_can_validate_without_consuming_token():
    call_metadata["CA123"] = {
        "ws_token": "expected-token",
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": False,
    }

    metadata = await authenticate_websocket_call(
        {"call_id": "CA123", "body": {"ws_token": "expected-token"}},
        {},
        consume_token=False,
    )

    assert metadata["ws_token_consumed"] is False

    consumed = await authenticate_websocket_call(
        {"call_id": "CA123", "body": {"ws_token": "expected-token"}},
        {},
    )
    assert consumed["ws_token_consumed"] is True


@pytest.mark.asyncio
async def test_websocket_auth_accepts_telnyx_call_control_id_with_query_token():
    call_metadata["v2:call-control"] = {
        "ws_token": "expected-token",
        "ws_token_expires_at": time.time() + 300,
        "ws_token_consumed": False,
    }

    metadata = await authenticate_websocket_call(
        {
            "call_control_id": "v2:call-control",
            "query_params": {"ws_token": "expected-token"},
        },
        {},
    )

    assert metadata["ws_token_consumed"] is True
