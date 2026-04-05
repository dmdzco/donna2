/**
 * Data retention service -- scheduled purge of expired PHI data.
 *
 * HIPAA requires defined retention periods for protected health information.
 * This service runs once per day (integrated into the Node.js scheduler) and
 * deletes data older than the configured retention period for each table.
 *
 * Retention periods are configurable via environment variables.
 * Purges use batched DELETEs (LIMIT 5000) to avoid long-running transactions.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';

const log = createLogger('DataRetention');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5000;

/**
 * Retention periods in days, configurable via environment variables.
 * Set a value to 0 to disable purge for that table.
 */
const RETENTION_DAYS = {
  conversations:        parseInt(process.env.RETENTION_CONVERSATIONS_DAYS        || '365', 10),
  memories:             parseInt(process.env.RETENTION_MEMORIES_DAYS             || '730', 10),
  call_analyses:        parseInt(process.env.RETENTION_CALL_ANALYSES_DAYS        || '365', 10),
  daily_call_context:   parseInt(process.env.RETENTION_DAILY_CONTEXT_DAYS        || '90',  10),
  call_metrics:         parseInt(process.env.RETENTION_CALL_METRICS_DAYS         || '180', 10),
  reminder_deliveries:  parseInt(process.env.RETENTION_REMINDER_DELIVERIES_DAYS  || '90',  10),
  audit_logs:           parseInt(process.env.RETENTION_AUDIT_LOGS_DAYS           || '730', 10),
};

/**
 * Map of table name -> date column used for age comparison.
 * Only tables listed here will be purged.
 */
const TABLE_DATE_COLUMNS = {
  conversations:        'created_at',
  memories:             'created_at',
  call_analyses:        'created_at',
  daily_call_context:   'created_at',
  call_metrics:         'created_at',
  reminder_deliveries:  'created_at',
  audit_logs:           'created_at',
};

const ALLOWED_TABLES = new Set(Object.keys(TABLE_DATE_COLUMNS));

// ---------------------------------------------------------------------------
// Core purge logic
// ---------------------------------------------------------------------------

/**
 * Purge rows from a single table older than `days` days, in batches.
 * @param {string} table - Table name (must be in ALLOWED_TABLES)
 * @param {string} dateColumn - Column to compare against
 * @param {number} days - Retention period in days
 * @returns {Promise<number>} Total number of rows deleted
 */
async function purgeTable(table, dateColumn, days) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table ${table} is not in ALLOWED_TABLES`);
  }

  let totalDeleted = 0;

  while (true) {
    // The table and column names come from our own hardcoded config (not user
    // input), so embedding them in the query string is safe.
    const result = await db.execute(sql`
      WITH deleted AS (
        DELETE FROM ${sql.raw(table)}
        WHERE ${sql.raw(dateColumn)} < NOW() - make_interval(days => ${days})
        LIMIT ${BATCH_SIZE}
        RETURNING 1
      ) SELECT count(*)::int AS count FROM deleted
    `);

    const batchCount = result.rows?.[0]?.count ?? 0;
    totalDeleted += batchCount;

    // If we deleted fewer than the batch size, we're done.
    if (batchCount < BATCH_SIZE) break;

    // Yield between batches to avoid blocking the event loop.
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return totalDeleted;
}

/**
 * Delete rows older than their retention period from all PHI tables.
 * @returns {Promise<Object>} Map of table name -> number of rows deleted
 */
export async function purgeExpiredData() {
  const results = {};

  for (const [table, days] of Object.entries(RETENTION_DAYS)) {
    if (days <= 0) continue; // 0 = disabled

    const dateColumn = TABLE_DATE_COLUMNS[table];
    if (!dateColumn) continue;

    try {
      const deleted = await purgeTable(table, dateColumn, days);
      results[table] = deleted;
    } catch (err) {
      // Log the error but continue with remaining tables so a single
      // missing table (e.g. audit_logs not yet created) doesn't block
      // the whole purge cycle.
      log.warn(`Failed to purge ${table}`, { error: err.message });
      results[table] = -1;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scheduler integration
// ---------------------------------------------------------------------------

let lastPurgeDate = null;

/**
 * Run the daily purge if it hasn't been run today.
 * Designed to be called from the scheduler's polling loop (every 60s).
 * The date check ensures it only actually runs once per calendar day.
 */
export async function runDailyPurgeIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (lastPurgeDate === today) return; // Already ran today

  log.info('Starting daily data retention purge');
  lastPurgeDate = today;

  try {
    const results = await purgeExpiredData();
    const total = Object.values(results).reduce((sum, v) => sum + Math.max(v, 0), 0);

    if (total > 0) {
      log.info('Data retention purge complete', { results, total });
    } else {
      log.info('Data retention purge: nothing to delete');
    }
  } catch (err) {
    log.error('Data retention purge failed', { error: err.message });
    // Reset so we retry next cycle
    lastPurgeDate = null;
  }
}

export const dataRetentionService = {
  purgeExpiredData,
  runDailyPurgeIfNeeded,
  RETENTION_DAYS,
};
