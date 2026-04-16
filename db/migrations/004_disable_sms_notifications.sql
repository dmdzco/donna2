-- SMS notifications are not an active Donna channel.
-- Keep the column for legacy API compatibility, but default and existing prefs to off.
ALTER TABLE notification_preferences
  ALTER COLUMN sms_enabled SET DEFAULT false;

UPDATE notification_preferences
SET sms_enabled = false
WHERE sms_enabled IS DISTINCT FROM false;
