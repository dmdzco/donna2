import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { encrypt, encryptJson } from '../lib/encryption.js';
import { isValidFieldEncryptionKey } from '../lib/security-config.js';

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const shouldNullPlaintext = args.has('--null-plaintext');

function usage() {
  console.log([
    'Usage:',
    '  node scripts/backfill-encrypted-phi.js --write',
    '  node scripts/backfill-encrypted-phi.js --write --null-plaintext',
    '',
    'Default without --write is a dry run. This script logs counts only.',
  ].join('\n'));
}

function resultRows(result) {
  return result?.rows || [];
}

function present(value) {
  return value !== null && value !== undefined;
}

function maybeJson(value) {
  if (!present(value)) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

async function tableExists(tableName) {
  const result = await db.execute(sql`SELECT to_regclass(${tableName}) AS regclass`);
  return Boolean(resultRows(result)[0]?.regclass);
}

async function backfillSeniors(summary) {
  if (!await tableExists('seniors')) return;
  const result = await db.execute(sql`
    SELECT id, family_info, family_info_encrypted,
           medical_notes, medical_notes_encrypted,
           preferred_call_times, preferred_call_times_encrypted,
           additional_info, additional_info_encrypted,
           call_context_snapshot, call_context_snapshot_encrypted
    FROM seniors
    WHERE (family_info IS NOT NULL AND family_info_encrypted IS NULL)
       OR (medical_notes IS NOT NULL AND medical_notes_encrypted IS NULL)
       OR (preferred_call_times IS NOT NULL AND preferred_call_times_encrypted IS NULL)
       OR (additional_info IS NOT NULL AND additional_info_encrypted IS NULL)
       OR (call_context_snapshot IS NOT NULL AND call_context_snapshot_encrypted IS NULL)
       OR (${shouldNullPlaintext} AND (
            family_info IS NOT NULL OR medical_notes IS NOT NULL
            OR preferred_call_times IS NOT NULL OR additional_info IS NOT NULL
            OR call_context_snapshot IS NOT NULL
       ))
  `);
  const rows = resultRows(result);
  summary.seniors = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    await db.execute(sql`
      UPDATE seniors SET
        family_info_encrypted = COALESCE(family_info_encrypted, ${present(row.family_info) ? encryptJson(maybeJson(row.family_info)) : null}),
        medical_notes_encrypted = COALESCE(medical_notes_encrypted, ${present(row.medical_notes) ? encrypt(row.medical_notes) : null}),
        preferred_call_times_encrypted = COALESCE(preferred_call_times_encrypted, ${present(row.preferred_call_times) ? encryptJson(maybeJson(row.preferred_call_times)) : null}),
        additional_info_encrypted = COALESCE(additional_info_encrypted, ${present(row.additional_info) ? encrypt(row.additional_info) : null}),
        call_context_snapshot_encrypted = COALESCE(call_context_snapshot_encrypted, ${present(row.call_context_snapshot) ? encryptJson(maybeJson(row.call_context_snapshot)) : null}),
        family_info = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE family_info END,
        medical_notes = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE medical_notes END,
        preferred_call_times = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE preferred_call_times END,
        additional_info = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE additional_info END,
        call_context_snapshot = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE call_context_snapshot END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillReminders(summary) {
  if (!await tableExists('reminders')) return;
  const result = await db.execute(sql`
    SELECT id, title, title_encrypted, description, description_encrypted
    FROM reminders
    WHERE (title IS NOT NULL AND title_encrypted IS NULL)
       OR (description IS NOT NULL AND description_encrypted IS NULL)
       OR (${shouldNullPlaintext} AND (title <> '[encrypted]' OR description IS NOT NULL))
  `);
  const rows = resultRows(result);
  summary.reminders = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    await db.execute(sql`
      UPDATE reminders SET
        title_encrypted = COALESCE(title_encrypted, ${present(row.title) ? encrypt(row.title) : null}),
        description_encrypted = COALESCE(description_encrypted, ${present(row.description) ? encrypt(row.description) : null}),
        title = CASE WHEN ${shouldNullPlaintext} THEN '[encrypted]' ELSE title END,
        description = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE description END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillReminderDeliveries(summary) {
  if (!await tableExists('reminder_deliveries')) return;
  const result = await db.execute(sql`
    SELECT id, user_response, user_response_encrypted
    FROM reminder_deliveries
    WHERE (user_response IS NOT NULL AND user_response_encrypted IS NULL)
       OR (${shouldNullPlaintext} AND user_response IS NOT NULL)
  `);
  const rows = resultRows(result);
  summary.reminderDeliveries = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    await db.execute(sql`
      UPDATE reminder_deliveries SET
        user_response_encrypted = COALESCE(user_response_encrypted, ${present(row.user_response) ? encrypt(row.user_response) : null}),
        user_response = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE user_response END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillDailyContext(summary) {
  if (!await tableExists('daily_call_context')) return;
  const result = await db.execute(sql`
    SELECT id, topics_discussed, reminders_delivered, advice_given, key_moments, summary, context_encrypted
    FROM daily_call_context
    WHERE context_encrypted IS NULL
       OR (${shouldNullPlaintext} AND (
            topics_discussed IS NOT NULL OR reminders_delivered IS NOT NULL
            OR advice_given IS NOT NULL OR key_moments IS NOT NULL OR summary IS NOT NULL
       ))
  `);
  const rows = resultRows(result);
  summary.dailyCallContext = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    const payload = {
      topicsDiscussed: row.topics_discussed || [],
      remindersDelivered: row.reminders_delivered || [],
      adviceGiven: row.advice_given || [],
      keyMoments: maybeJson(row.key_moments) || [],
      summary: row.summary || null,
    };
    await db.execute(sql`
      UPDATE daily_call_context SET
        context_encrypted = COALESCE(context_encrypted, ${encryptJson(payload)}),
        topics_discussed = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE topics_discussed END,
        reminders_delivered = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE reminders_delivered END,
        advice_given = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE advice_given END,
        key_moments = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE key_moments END,
        summary = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE summary END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillNotifications(summary) {
  if (!await tableExists('notifications')) return;
  const result = await db.execute(sql`
    SELECT id, content, content_encrypted, metadata, metadata_encrypted
    FROM notifications
    WHERE (content IS NOT NULL AND content_encrypted IS NULL)
       OR (metadata IS NOT NULL AND metadata_encrypted IS NULL)
       OR (${shouldNullPlaintext} AND (content <> '[encrypted]' OR metadata IS NOT NULL))
  `);
  const rows = resultRows(result);
  summary.notifications = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    await db.execute(sql`
      UPDATE notifications SET
        content_encrypted = COALESCE(content_encrypted, ${present(row.content) ? encrypt(row.content) : null}),
        metadata_encrypted = COALESCE(metadata_encrypted, ${present(row.metadata) ? encryptJson(maybeJson(row.metadata)) : null}),
        content = CASE WHEN ${shouldNullPlaintext} THEN '[encrypted]' ELSE content END,
        metadata = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE metadata END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillWaitlist(summary) {
  if (!await tableExists('waitlist')) return;
  const result = await db.execute(sql`
    SELECT id, name, email, phone, who_for, thoughts, payload_encrypted
    FROM waitlist
    WHERE payload_encrypted IS NULL
       OR (${shouldNullPlaintext} AND (
            name <> '[encrypted]' OR email <> '[encrypted]' OR phone IS NOT NULL
            OR who_for IS NOT NULL OR thoughts IS NOT NULL
       ))
  `);
  const rows = resultRows(result);
  summary.waitlist = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    const payload = {
      name: row.name || null,
      email: row.email || null,
      phone: row.phone || null,
      whoFor: row.who_for || null,
      thoughts: row.thoughts || null,
    };
    await db.execute(sql`
      UPDATE waitlist SET
        payload_encrypted = COALESCE(payload_encrypted, ${encryptJson(payload)}),
        name = CASE WHEN ${shouldNullPlaintext} THEN '[encrypted]' ELSE name END,
        email = CASE WHEN ${shouldNullPlaintext} THEN '[encrypted]' ELSE email END,
        phone = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE phone END,
        who_for = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE who_for END,
        thoughts = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE thoughts END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillProspects(summary) {
  if (!await tableExists('prospects')) return;
  const result = await db.execute(sql`
    SELECT id, learned_name, relationship, loved_one_name, caller_context, details_encrypted
    FROM prospects
    WHERE details_encrypted IS NULL
       OR (${shouldNullPlaintext} AND (
            learned_name IS NOT NULL OR relationship IS NOT NULL
            OR loved_one_name IS NOT NULL OR caller_context <> '{}'::jsonb
       ))
  `);
  const rows = resultRows(result);
  summary.prospects = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    const details = {
      learned_name: row.learned_name || null,
      relationship: row.relationship || null,
      loved_one_name: row.loved_one_name || null,
      caller_context: maybeJson(row.caller_context) || {},
    };
    await db.execute(sql`
      UPDATE prospects SET
        details_encrypted = COALESCE(details_encrypted, ${encryptJson(details)}),
        learned_name = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE learned_name END,
        relationship = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE relationship END,
        loved_one_name = CASE WHEN ${shouldNullPlaintext} THEN NULL ELSE loved_one_name END,
        caller_context = CASE WHEN ${shouldNullPlaintext} THEN '{}'::jsonb ELSE caller_context END
      WHERE id = ${row.id}
    `);
  }
}

async function backfillCaregiverNotes(summary) {
  if (!await tableExists('caregiver_notes')) return;
  const result = await db.execute(sql`
    SELECT id, content, content_encrypted
    FROM caregiver_notes
    WHERE (content IS NOT NULL AND content_encrypted IS NULL)
       OR (${shouldNullPlaintext} AND content <> '[encrypted]')
  `);
  const rows = resultRows(result);
  summary.caregiverNotes = rows.length;
  if (!shouldWrite) return;

  for (const row of rows) {
    await db.execute(sql`
      UPDATE caregiver_notes SET
        content_encrypted = COALESCE(content_encrypted, ${present(row.content) ? encrypt(row.content) : null}),
        content = CASE WHEN ${shouldNullPlaintext} THEN '[encrypted]' ELSE content END
      WHERE id = ${row.id}
    `);
  }
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    usage();
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  if (!isValidFieldEncryptionKey(process.env.FIELD_ENCRYPTION_KEY || '')) {
    throw new Error('FIELD_ENCRYPTION_KEY must be set and decode to 32 bytes before PHI backfill');
  }

  const summary = {
    mode: shouldWrite ? 'write' : 'dry-run',
    nullPlaintext: shouldNullPlaintext,
  };

  await backfillSeniors(summary);
  await backfillReminders(summary);
  await backfillReminderDeliveries(summary);
  await backfillDailyContext(summary);
  await backfillNotifications(summary);
  await backfillWaitlist(summary);
  await backfillProspects(summary);
  await backfillCaregiverNotes(summary);

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`PHI backfill failed: ${error.message}`);
    process.exit(1);
  });
