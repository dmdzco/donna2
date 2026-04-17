import { getPipecatPublicUrl, parseServiceApiKeys } from '../lib/security-config.js';

function getPipecatServiceKey(env = process.env) {
  const keys = parseServiceApiKeys(env);
  for (const label of ['pipecat', 'node', 'scheduler', 'legacy']) {
    const key = keys.get(label);
    if (key) return key;
  }
  for (const key of keys.values()) {
    if (key) return key;
  }
  return env.DONNA_API_KEY || '';
}

function resolvePipecatUrl(baseUrl, env = process.env) {
  return String(baseUrl || getPipecatPublicUrl(env) || '').replace(/\/+$/, '');
}

async function postPipecat(path, body, { baseUrl, env = process.env } = {}) {
  const pipecatUrl = resolvePipecatUrl(baseUrl, env);
  const apiKey = getPipecatServiceKey(env);
  if (!pipecatUrl) {
    throw new Error('PIPECAT_PUBLIC_URL is not configured');
  }
  if (!apiKey) {
    throw new Error('DONNA_API_KEYS is not configured for service calls');
  }

  const response = await fetch(`${pipecatUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body || {}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Pipecat Telnyx request failed: ${detail}`);
  }

  return payload;
}

export async function initiateTelnyxOutboundCall({
  seniorId,
  callType = 'check-in',
  reminderId,
  scheduledFor,
  existingDeliveryId,
  prewarmedContext,
  baseUrl,
}) {
  return postPipecat('/telnyx/outbound', {
    seniorId,
    callType,
    ...(reminderId ? { reminderId } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
    ...(existingDeliveryId ? { existingDeliveryId } : {}),
    ...(prewarmedContext ? { prewarmedContext } : {}),
  }, { baseUrl });
}

export async function prewarmTelnyxOutboundContext({
  seniorId,
  callType = 'reminder',
  reminderId,
  scheduledFor,
  baseUrl,
}) {
  return postPipecat('/telnyx/prewarm', {
    seniorId,
    callType,
    ...(reminderId ? { reminderId } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
  }, { baseUrl });
}

export async function endTelnyxCall(callSid, { baseUrl } = {}) {
  return postPipecat(`/telnyx/calls/${encodeURIComponent(callSid)}/end`, {}, { baseUrl });
}
