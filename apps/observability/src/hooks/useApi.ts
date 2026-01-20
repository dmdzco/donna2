import { useState, useEffect, useCallback } from 'react';
import type { Call, Timeline, Turn, ObserverSummary, Continuity } from '../types';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/observability`
  : '/api/observability';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export function useActiveCalls() {
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<{ activeCalls: Call[] }>(`${API_BASE}/active`);
      setActiveCalls(data.activeCalls);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 5 seconds for active calls
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { activeCalls, loading, error, refresh };
}

export function useCalls(limit = 50) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ calls: Call[] }>(`${API_BASE}/calls?limit=${limit}`);
      setCalls(data.calls);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { calls, loading, error, refresh };
}

export function useCallTimeline(callId: string | undefined) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) {
      setTimeline(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchJson<Timeline>(`${API_BASE}/calls/${callId}/timeline`)
      .then((data) => {
        setTimeline(data);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [callId]);

  return { timeline, loading, error };
}

export function useCallTurns(callId: string | undefined) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) {
      setTurns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchJson<{ turns: Turn[] }>(`${API_BASE}/calls/${callId}/turns`)
      .then((data) => {
        setTurns(data.turns);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [callId]);

  return { turns, loading, error };
}

export function useObserverSignals(callId: string | undefined) {
  const [data, setData] = useState<ObserverSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchJson<ObserverSummary>(`${API_BASE}/calls/${callId}/observer`)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [callId]);

  return { data, loading, error };
}

export function useContinuity(seniorId: string | undefined) {
  const [continuity, setContinuity] = useState<Continuity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seniorId) {
      setContinuity(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchJson<Continuity>(`${API_BASE}/continuity/${seniorId}`)
      .then((data) => {
        setContinuity(data);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [seniorId]);

  return { continuity, loading, error };
}
