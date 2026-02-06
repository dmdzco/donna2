import { useState, useEffect, useCallback } from 'react';
import type { Call, Timeline, Turn, ObserverSummary, Continuity, MetricsData } from '../types';

const API_ROOT = import.meta.env.VITE_API_URL || '';
const API_BASE = `${API_ROOT}/api/observability`;

const TOKEN_KEY = 'donna_obs_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_ROOT}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }
  const data = await response.json();
  setToken(data.token);
  return data.token;
}

async function fetchJson<T>(url: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (response.status === 401) {
    clearToken();
    throw new Error('AUTH_EXPIRED');
  }
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

export function useCallMetrics(callId: string | undefined) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchJson<MetricsData>(`${API_BASE}/calls/${callId}/metrics`)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [callId]);

  return { data, loading, error };
}
