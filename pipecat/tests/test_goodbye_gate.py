"""Tests for goodbye gate — false-goodbye grace period."""

import asyncio

import pytest

from processors.goodbye_gate import GoodbyeGateProcessor, GOODBYE_SILENCE_SECONDS


class TestGoodbyeGateState:
    def test_initial_state(self):
        gate = GoodbyeGateProcessor()
        assert not gate.is_ending
        assert not gate._senior_said_goodbye
        assert not gate._donna_said_goodbye

    def test_notify_goodbye_detected(self):
        gate = GoodbyeGateProcessor()
        gate.notify_goodbye_detected()
        assert gate._senior_said_goodbye

    def test_notify_donna_goodbye(self):
        gate = GoodbyeGateProcessor()
        gate.notify_donna_goodbye()
        assert gate._donna_said_goodbye

    def test_cancel_ending_resets_state(self):
        gate = GoodbyeGateProcessor()
        gate._senior_said_goodbye = True
        gate._donna_said_goodbye = True
        gate._ending_initiated = True
        gate._cancel_ending()
        assert not gate._senior_said_goodbye
        assert not gate._donna_said_goodbye
        assert not gate._ending_initiated

    @pytest.mark.asyncio
    async def test_initiate_ending_only_when_not_already_initiated(self):
        gate = GoodbyeGateProcessor()
        gate._initiate_ending()
        assert gate.is_ending
        first_task = gate._timer_task
        assert first_task is not None
        # Calling again should not create new timer
        gate._initiate_ending()
        assert gate._timer_task is first_task
        # Cleanup
        gate._cancel_ending()


class TestGoodbyeGateCallback:
    @pytest.mark.asyncio
    async def test_callback_fires_after_silence(self):
        callback_called = asyncio.Event()

        async def on_goodbye():
            callback_called.set()

        gate = GoodbyeGateProcessor(on_goodbye=on_goodbye)
        gate._senior_said_goodbye = True
        gate._donna_said_goodbye = True
        gate._initiate_ending()

        # Wait slightly longer than the silence period
        try:
            await asyncio.wait_for(callback_called.wait(), timeout=GOODBYE_SILENCE_SECONDS + 1)
            assert callback_called.is_set()
        finally:
            gate._cancel_ending()

    @pytest.mark.asyncio
    async def test_callback_cancelled_when_senior_speaks(self):
        callback_called = asyncio.Event()

        async def on_goodbye():
            callback_called.set()

        gate = GoodbyeGateProcessor(on_goodbye=on_goodbye)
        gate._initiate_ending()

        # Cancel after a short delay
        await asyncio.sleep(0.1)
        gate._cancel_ending()

        # Wait and verify callback was NOT called
        await asyncio.sleep(0.5)
        assert not callback_called.is_set()

    @pytest.mark.asyncio
    async def test_no_callback_without_on_goodbye(self):
        gate = GoodbyeGateProcessor(on_goodbye=None)
        gate._initiate_ending()
        # Should not crash even without callback
        await asyncio.sleep(0.1)
        gate._cancel_ending()


class TestGoodbyeGateCleanup:
    @pytest.mark.asyncio
    async def test_cleanup_cancels_timer(self):
        gate = GoodbyeGateProcessor()
        gate._initiate_ending()
        assert gate._timer_task is not None
        await gate.cleanup()
        assert not gate.is_ending
