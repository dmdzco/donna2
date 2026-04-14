import { db } from '../db/client.js';
import { callAnalyses } from '../db/schema.js';
import { desc, inArray } from 'drizzle-orm';
import { decryptJson } from '../lib/encryption.js';

function asArray(value) {
  const parsed = parseJsonString(value);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonString(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function coalesceArray(...values) {
  for (const value of values) {
    const array = asArray(value);
    if (array.length > 0) return array;
  }
  return [];
}

function coalesceObject(...values) {
  for (const value of values) {
    const parsed = parseJsonString(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  }
  return null;
}

function fromEncrypted(row) {
  if (!row?.analysisEncrypted) return {};
  const decrypted = decryptJson(row.analysisEncrypted);
  return decrypted && typeof decrypted === 'object' && !Array.isArray(decrypted)
    ? decrypted
    : {};
}

export function normalizeCallAnalysis(row) {
  if (!row) return null;

  const encrypted = fromEncrypted(row);
  const summary = row.summary || encrypted.summary || null;
  const engagementScore = row.engagementScore ?? encrypted.engagement_score ?? null;

  return {
    id: row.id,
    conversationId: row.conversationId,
    seniorId: row.seniorId,
    summary,
    topics: coalesceArray(row.topics, encrypted.topics_discussed, encrypted.topics),
    engagementScore,
    concerns: coalesceArray(row.concerns, encrypted.concerns),
    positiveObservations: coalesceArray(row.positiveObservations, encrypted.positive_observations),
    followUpSuggestions: coalesceArray(row.followUpSuggestions, encrypted.follow_up_suggestions),
    callQuality: coalesceObject(row.callQuality, encrypted.call_quality),
    createdAt: row.createdAt,
  };
}

export const callAnalysisService = {
  async getLatestByConversationIds(conversationIds) {
    const ids = [...new Set((conversationIds || []).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const rows = await db.select({
      id: callAnalyses.id,
      conversationId: callAnalyses.conversationId,
      seniorId: callAnalyses.seniorId,
      summary: callAnalyses.summary,
      topics: callAnalyses.topics,
      engagementScore: callAnalyses.engagementScore,
      concerns: callAnalyses.concerns,
      positiveObservations: callAnalyses.positiveObservations,
      followUpSuggestions: callAnalyses.followUpSuggestions,
      callQuality: callAnalyses.callQuality,
      analysisEncrypted: callAnalyses.analysisEncrypted,
      createdAt: callAnalyses.createdAt,
    })
    .from(callAnalyses)
    .where(inArray(callAnalyses.conversationId, ids))
    .orderBy(desc(callAnalyses.createdAt));

    const latest = new Map();
    for (const row of rows) {
      if (!latest.has(row.conversationId)) {
        latest.set(row.conversationId, normalizeCallAnalysis(row));
      }
    }
    return latest;
  },
};
