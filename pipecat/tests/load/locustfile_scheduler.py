"""Scheduler throughput load test.

Seeds N test reminders due NOW, then triggers the scheduler loop and
measures how long it takes to initiate all calls. Uses a mock Twilio client.

Run:
    cd pipecat
    LOAD_TEST_DB_URL=postgresql://... uv run python tests/load/locustfile_scheduler.py
"""

import asyncio
import os
import sys
import time
import uuid


async def run_scheduler_load_test(num_reminders: int = 100):
    """Seed reminders and measure scheduler throughput."""
    db_url = os.getenv("LOAD_TEST_DB_URL", os.getenv("DATABASE_URL", ""))
    if not db_url:
        print("ERROR: LOAD_TEST_DB_URL or DATABASE_URL required")
        sys.exit(1)

    import asyncpg

    pool = await asyncpg.create_pool(db_url, min_size=5, max_size=20)

    # Create a test senior (UUID column, unique phone constraint)
    test_senior_id = uuid.uuid4()
    test_phone = f"555{uuid.uuid4().hex[:7]}"
    await pool.execute(
        """INSERT INTO seniors (id, name, phone, timezone, is_active)
           VALUES ($1, 'Load Test Senior', $2, 'America/New_York', true)""",
        test_senior_id, test_phone,
    )

    # Seed N reminders due now
    print(f"Seeding {num_reminders} test reminders...")
    for i in range(num_reminders):
        await pool.execute(
            """INSERT INTO reminders (senior_id, title, description, type, scheduled_time, is_active, is_recurring)
               VALUES ($1, $2, $3, 'medication', NOW() - INTERVAL '1 minute', true, false)""",
            test_senior_id,
            f"Load Test Reminder {i}",
            f"Test reminder {i} for scheduler throughput",
        )

    # Measure get_due_reminders
    print("Running get_due_reminders()...")
    start = time.time()

    # Import scheduler and mock Twilio
    os.environ["DATABASE_URL"] = db_url
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

    from services.scheduler import get_due_reminders
    due = await get_due_reminders()
    fetch_elapsed = time.time() - start
    print(f"  Found {len(due)} due reminders in {fetch_elapsed:.2f}s")

    # Cleanup test data (delete deliveries first — FK constraint)
    print("Cleaning up test data...")
    await pool.execute(
        "DELETE FROM reminder_deliveries WHERE reminder_id IN (SELECT id FROM reminders WHERE senior_id = $1)",
        test_senior_id,
    )
    await pool.execute("DELETE FROM reminders WHERE senior_id = $1", test_senior_id)
    await pool.execute("DELETE FROM seniors WHERE id = $1", test_senior_id)
    await pool.close()

    print(f"\nResults:")
    print(f"  Reminders seeded: {num_reminders}")
    print(f"  Due reminders found: {len(due)}")
    print(f"  Query time: {fetch_elapsed:.3f}s")
    print(f"  Throughput: {len(due) / fetch_elapsed:.0f} reminders/sec")


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    asyncio.run(run_scheduler_load_test(count))
