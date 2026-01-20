import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '../db/client.js';
import { loggers } from '@donna/logger';
import { eventBus, type ObservabilityEvent } from '@donna/event-bus';

const log = loggers.api;

interface Client {
  ws: WebSocket;
  callId?: string; // Subscribe to specific call
  seniorId?: string; // Subscribe to all calls for a senior
  subscribeAll: boolean; // Subscribe to all events
}

class ObservabilityService {
  private wss: WebSocketServer | null = null;
  private clients: Set<Client> = new Set();

  /**
   * Initialize WebSocket server and event listeners
   */
  initialize(server: Server) {
    // Create WebSocket server on /api/observability/live path
    this.wss = new WebSocketServer({
      server,
      path: '/api/observability/live'
    });

    this.wss.on('connection', (ws, req) => {
      const client: Client = { ws, subscribeAll: false };
      this.clients.add(client);

      log.info({ clientCount: this.clients.size }, 'WebSocket client connected');

      // Handle subscription messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (err) {
          log.warn({ error: (err as Error).message }, 'Invalid WebSocket message');
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
        log.info({ clientCount: this.clients.size }, 'WebSocket client disconnected');
      });

      ws.on('error', (err) => {
        log.error({ error: err.message }, 'WebSocket error');
        this.clients.delete(client);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
    });

    // Subscribe to all event bus events
    this.subscribeToEventBus();

    log.info('Observability WebSocket server initialized');
  }

  /**
   * Handle messages from WebSocket clients
   */
  private handleClientMessage(client: Client, message: { action: string; callId?: string; seniorId?: string }) {
    switch (message.action) {
      case 'subscribe:call':
        client.callId = message.callId;
        client.subscribeAll = false;
        log.debug({ callId: message.callId }, 'Client subscribed to call');
        break;

      case 'subscribe:senior':
        client.seniorId = message.seniorId;
        client.subscribeAll = false;
        log.debug({ seniorId: message.seniorId }, 'Client subscribed to senior');
        break;

      case 'subscribe:all':
        client.subscribeAll = true;
        log.debug('Client subscribed to all events');
        break;

      case 'unsubscribe':
        client.callId = undefined;
        client.seniorId = undefined;
        client.subscribeAll = false;
        log.debug('Client unsubscribed');
        break;

      default:
        log.warn({ action: message.action }, 'Unknown WebSocket action');
    }
  }

  /**
   * Subscribe to event bus and broadcast to WebSocket clients
   */
  private subscribeToEventBus() {
    eventBus.onAll(async (event: ObservabilityEvent) => {
      // Persist event to database
      await this.persistEvent(event);

      // Broadcast to relevant clients
      this.broadcastEvent(event);
    });
  }

  /**
   * Persist event to observability_events table
   */
  private async persistEvent(event: ObservabilityEvent) {
    try {
      const callId = 'callId' in event ? event.callId : undefined;
      const conversationId = 'conversationId' in event ? event.conversationId : undefined;
      const seniorId = 'seniorId' in event ? event.seniorId : undefined;

      await db.query(
        `INSERT INTO observability_events (event_type, call_id, conversation_id, senior_id, timestamp, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.type,
          callId,
          conversationId,
          seniorId,
          event.timestamp,
          JSON.stringify(event),
        ]
      );

      log.debug({ eventType: event.type, callId }, 'Event persisted');
    } catch (err) {
      log.error({ error: (err as Error).message, eventType: event.type }, 'Failed to persist event');
    }
  }

  /**
   * Broadcast event to relevant WebSocket clients
   */
  private broadcastEvent(event: ObservabilityEvent) {
    const eventCallId = 'callId' in event ? event.callId : undefined;
    const eventSeniorId = 'seniorId' in event ? event.seniorId : undefined;

    const message = JSON.stringify({
      type: 'event',
      event,
    });

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      // Check if client should receive this event
      const shouldReceive =
        client.subscribeAll ||
        (client.callId && client.callId === eventCallId) ||
        (client.seniorId && client.seniorId === eventSeniorId);

      if (shouldReceive) {
        client.ws.send(message);
      }
    }
  }

  /**
   * Get list of currently active calls (in_progress status)
   */
  async getActiveCalls() {
    const result = await db.query(
      `SELECT
        c.id,
        c.senior_id,
        c.call_sid,
        c.started_at,
        c.status,
        c.initiated_by,
        s.name as senior_name,
        s.phone as senior_phone,
        (SELECT COUNT(*) FROM conversation_turns WHERE conversation_id = c.id) as turn_count
      FROM conversations c
      LEFT JOIN seniors s ON c.senior_id = s.id
      WHERE c.status = 'in_progress'
      ORDER BY c.started_at DESC`
    );
    return result.rows;
  }

  /**
   * Get recent events for a call (for catching up new subscribers)
   */
  async getRecentEventsForCall(callId: string, limit = 100) {
    const result = await db.query(
      `SELECT * FROM observability_events
       WHERE call_id = $1 OR conversation_id = $1
       ORDER BY timestamp ASC
       LIMIT $2`,
      [callId, limit]
    );
    return result.rows;
  }
}

// Singleton instance
export const observabilityService = new ObservabilityService();
