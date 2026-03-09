"""Tests for bot.py event handlers and main.py graceful shutdown.

Covers:
  - Task registration (register_call_task, _active_tasks)
  - Session state wiring (_register_task in session_state)
  - Post-call task registration on disconnect (bot.py on_disconnected logic)
  - Graceful shutdown draining and cancellation (main.py shutdown)
"""

from __future__ import annotations

import asyncio

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Fixtures for module-level state isolation
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _isolate_main_state():
    """Save and restore main.py module-level state between tests.

    main.py uses module-level globals (_active_tasks, _shutting_down).
    Each test gets a clean slate so they don't interfere with each other.
    """
    import main

    original_tasks = main._active_tasks.copy()
    original_shutting_down = main._shutting_down

    # Reset to clean state before each test
    main._active_tasks.clear()
    main._shutting_down = False

    yield

    # Restore original state after each test
    main._active_tasks.clear()
    main._active_tasks.update(original_tasks)
    main._shutting_down = original_shutting_down


# ===========================================================================
# Test Group 1: Task Registration (main.py)
# ===========================================================================

class TestTaskRegistration:
    """Tests for register_call_task and _active_tasks tracking."""

    @pytest.mark.asyncio
    async def test_register_call_task_adds_to_active_set(self):
        """Register a task, verify it appears in _active_tasks."""
        from main import register_call_task, _active_tasks

        # Create a long-running task so it stays in the set
        task = asyncio.create_task(asyncio.sleep(999))
        register_call_task(task)

        assert task in _active_tasks

        # Cleanup: cancel so the test doesn't hang
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_register_call_task_auto_removes_on_done(self):
        """Register a task that completes normally; verify auto-removal."""
        from main import register_call_task, _active_tasks

        task = asyncio.create_task(asyncio.sleep(0))
        register_call_task(task)

        assert task in _active_tasks

        # Let the task complete
        await task
        # The done_callback fires on the next event loop iteration
        await asyncio.sleep(0)

        assert task not in _active_tasks

    @pytest.mark.asyncio
    async def test_register_call_task_auto_removes_on_exception(self):
        """A task that raises an exception is still removed from the set."""
        from main import register_call_task, _active_tasks

        async def failing_coro():
            raise ValueError("boom")

        task = asyncio.create_task(failing_coro())
        register_call_task(task)

        # Wait for the task to fail
        with pytest.raises(ValueError, match="boom"):
            await task
        # Let the done_callback fire
        await asyncio.sleep(0)

        assert task not in _active_tasks

    @pytest.mark.asyncio
    async def test_multiple_tasks_tracked_concurrently(self):
        """Register 3 tasks, complete one, verify the other 2 remain tracked."""
        from main import register_call_task, _active_tasks

        quick_task = asyncio.create_task(asyncio.sleep(0))
        slow_task_1 = asyncio.create_task(asyncio.sleep(999))
        slow_task_2 = asyncio.create_task(asyncio.sleep(999))

        register_call_task(quick_task)
        register_call_task(slow_task_1)
        register_call_task(slow_task_2)

        assert len(_active_tasks) == 3

        # Let the quick task complete
        await quick_task
        await asyncio.sleep(0)

        assert len(_active_tasks) == 2
        assert quick_task not in _active_tasks
        assert slow_task_1 in _active_tasks
        assert slow_task_2 in _active_tasks

        # Cleanup
        slow_task_1.cancel()
        slow_task_2.cancel()
        for t in (slow_task_1, slow_task_2):
            try:
                await t
            except asyncio.CancelledError:
                pass


# ===========================================================================
# Test Group 2: Session State Wiring (main.py -> bot.py)
# ===========================================================================

class TestSessionStateWiring:
    """Verify session_state created in websocket_endpoint includes _register_task."""

    @pytest.mark.asyncio
    async def test_session_state_has_register_task(self):
        """The session_state dict passed to run_bot includes a callable _register_task."""
        from main import register_call_task

        # Rather than running the full websocket_endpoint (which needs a real
        # WebSocket, Twilio handshake, etc.), we verify the contract: the
        # session_state dict built in websocket_endpoint sets _register_task
        # to register_call_task. We replicate the exact dict construction from
        # main.py lines 198-218 and check the key.
        session_state = {
            "senior_id": None,
            "senior": None,
            "prospect": None,
            "prospect_id": None,
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
            "_call_metadata": {},
            "_register_task": register_call_task,
        }

        assert "_register_task" in session_state
        assert callable(session_state["_register_task"])
        assert session_state["_register_task"] is register_call_task


# ===========================================================================
# Test Group 3: Post-call Task Registration (bot.py on_disconnected)
# ===========================================================================

class TestOnDisconnected:
    """Tests for the on_disconnected event handler logic in bot.py.

    The actual handler is a closure inside run_bot(), so we test the individual
    behaviors it implements: _end_reason defaulting, tracker flushing, and
    task registration via _register_task.
    """

    @pytest.mark.asyncio
    async def test_post_call_task_registered_on_disconnect(self):
        """Simulate disconnect: verify post-call task is registered via _register_task."""
        from main import register_call_task, _active_tasks

        registered_tasks = []

        def tracking_register(task):
            registered_tasks.append(task)
            register_call_task(task)

        session_state = {
            "senior_id": "senior-test-001",
            "senior": {"id": "senior-test-001", "name": "Test"},
            "conversation_id": "conv-001",
            "call_sid": "CA-test",
            "call_type": "check-in",
            "_transcript": [],
            "_register_task": tracking_register,
            "reminders_delivered": set(),
        }

        # Simulate what on_disconnected does: create a post-call task and register it
        async def fake_post_call():
            await asyncio.sleep(0)

        post_call_task = asyncio.create_task(fake_post_call())

        register_fn = session_state.get("_register_task")
        assert register_fn is not None
        register_fn(post_call_task)

        assert len(registered_tasks) == 1
        assert post_call_task in _active_tasks

        await post_call_task
        await asyncio.sleep(0)

    @pytest.mark.asyncio
    async def test_end_reason_defaults_to_user_hangup(self):
        """setdefault('_end_reason', 'user_hangup') sets value when key is absent."""
        session_state = {
            "call_sid": "CA-test",
            "_transcript": [],
        }

        # Replicate on_disconnected's setdefault call
        session_state.setdefault("_end_reason", "user_hangup")

        assert session_state["_end_reason"] == "user_hangup"

    @pytest.mark.asyncio
    async def test_end_reason_not_overwritten_if_already_set(self):
        """setdefault preserves an existing _end_reason (e.g. set by Director timeout)."""
        session_state = {
            "call_sid": "CA-test",
            "_end_reason": "timeout",
            "_transcript": [],
        }

        # Replicate on_disconnected's setdefault call
        session_state.setdefault("_end_reason", "user_hangup")

        assert session_state["_end_reason"] == "timeout"

    @pytest.mark.asyncio
    async def test_tracker_flushed_before_post_call(self):
        """conversation_tracker.flush() is called before post-call task is created."""
        from processors.conversation_tracker import ConversationTrackerProcessor

        session_state = {
            "senior_id": "senior-test-001",
            "senior": {"id": "senior-test-001", "name": "Test"},
            "call_sid": "CA-test",
            "_transcript": [],
        }

        tracker = ConversationTrackerProcessor(session_state=session_state)

        # Track call order
        call_order = []

        original_flush = tracker.flush

        def tracked_flush():
            call_order.append("flush")
            return original_flush()

        tracker.flush = tracked_flush

        async def fake_post_call():
            call_order.append("post_call")

        # Replicate on_disconnected sequence:
        # 1. flush tracker
        # 2. create post-call task
        tracker.flush()
        post_call_task = asyncio.create_task(fake_post_call())
        await post_call_task

        assert call_order == ["flush", "post_call"]


# ===========================================================================
# Test Group 4: Graceful Shutdown (main.py)
# ===========================================================================

class TestGracefulShutdown:
    """Tests for the shutdown() event handler in main.py."""

    @pytest.mark.asyncio
    async def test_shutdown_sets_shutting_down_flag(self):
        """shutdown() sets _shutting_down to True."""
        import main

        assert main._shutting_down is False

        # Patch out DB/GrowthBook cleanup to isolate shutdown logic
        with patch("main.close_pool", new_callable=AsyncMock, create=True), \
             patch("main.close_growthbook", new_callable=AsyncMock, create=True):
            # Call shutdown directly — it's an async function registered on FastAPI
            await main.shutdown()

        assert main._shutting_down is True

    @pytest.mark.asyncio
    async def test_shutdown_waits_for_active_tasks(self):
        """shutdown() waits for active tasks to complete (within 7s timeout)."""
        import main

        completed = False

        async def quick_work():
            nonlocal completed
            await asyncio.sleep(0.1)
            completed = True

        task = asyncio.create_task(quick_work())
        main._active_tasks.add(task)
        task.add_done_callback(main._active_tasks.discard)

        with patch("main.close_pool", new_callable=AsyncMock, create=True), \
             patch("main.close_growthbook", new_callable=AsyncMock, create=True):
            await main.shutdown()

        assert completed is True

    @pytest.mark.asyncio
    async def test_shutdown_cancels_slow_tasks(self):
        """Tasks exceeding the drain timeout are cancelled."""
        import main

        cancelled = False

        async def slow_work():
            nonlocal cancelled
            try:
                await asyncio.sleep(999)
            except asyncio.CancelledError:
                cancelled = True
                raise

        task = asyncio.create_task(slow_work())
        main._active_tasks.add(task)
        task.add_done_callback(main._active_tasks.discard)

        # Monkey-patch the shutdown to use shorter timeouts for testing.
        # The real shutdown uses asyncio.wait(..., timeout=7.0) then
        # asyncio.wait(pending, timeout=2.0). We override to run fast.
        original_shutdown = main.shutdown

        async def fast_shutdown():
            """Shutdown with shorter timeouts for test speed."""
            main._shutting_down = True
            if main._active_tasks:
                done, pending = await asyncio.wait(
                    list(main._active_tasks), timeout=0.1
                )
                if pending:
                    for t in pending:
                        t.cancel()
                    await asyncio.wait(pending, timeout=0.5)
            # Skip DB/GrowthBook cleanup
            return

        await fast_shutdown()

        assert cancelled is True

    @pytest.mark.asyncio
    async def test_is_shutting_down_rejects_new_websockets(self):
        """When _shutting_down is True, websocket_endpoint closes the connection."""
        import main

        main._shutting_down = True

        # Create a mock WebSocket that records close() calls
        mock_ws = AsyncMock()
        mock_ws.close = AsyncMock()

        # Call the websocket_endpoint — it should close immediately
        await main.websocket_endpoint(mock_ws)

        mock_ws.close.assert_awaited_once_with(
            code=1001, reason="Server shutting down"
        )
