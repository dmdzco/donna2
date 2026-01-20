import { useState, useEffect, useRef, useCallback } from 'react';
import type { TimelineEvent } from '../types';

interface WebSocketMessage {
  type: 'connected' | 'event';
  event?: TimelineEvent & { callId?: string; seniorId?: string };
  timestamp?: string;
}

interface UseWebSocketOptions {
  callId?: string;
  seniorId?: string;
  subscribeAll?: boolean;
  onEvent?: (event: TimelineEvent) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  const connect = useCallback(() => {
    // Determine WebSocket URL
    let wsUrl: string;
    if (import.meta.env.VITE_API_URL) {
      const apiUrl = new URL(import.meta.env.VITE_API_URL);
      const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${apiUrl.host}/api/observability/live`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/api/observability/live`;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);

      // Send subscription based on options
      if (options.callId) {
        ws.send(JSON.stringify({ action: 'subscribe:call', callId: options.callId }));
      } else if (options.seniorId) {
        ws.send(JSON.stringify({ action: 'subscribe:senior', seniorId: options.seniorId }));
      } else if (options.subscribeAll) {
        ws.send(JSON.stringify({ action: 'subscribe:all' }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'event' && message.event) {
          const timelineEvent: TimelineEvent = {
            type: message.event.type,
            timestamp: message.event.timestamp || new Date().toISOString(),
            data: message.event as unknown as Record<string, unknown>,
          };

          setEvents((prev) => [...prev, timelineEvent]);
          options.onEvent?.(timelineEvent);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Attempt reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, [options.callId, options.seniorId, options.subscribeAll, options.onEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback((type: 'call' | 'senior' | 'all', id?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (type === 'call' && id) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe:call', callId: id }));
    } else if (type === 'senior' && id) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe:senior', seniorId: id }));
    } else if (type === 'all') {
      wsRef.current.send(JSON.stringify({ action: 'subscribe:all' }));
    }
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    connected,
    events,
    subscribe,
    clearEvents,
    disconnect,
  };
}
