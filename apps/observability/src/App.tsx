import { useMemo, useState, useEffect } from 'react';
import { CallList } from './components/CallList';
import { CallTimeline } from './components/CallTimeline';
import { ContextPanel } from './components/ContextPanel';
import { ObserverPanel } from './components/ObserverPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { LiveCallMonitor } from './components/LiveCallMonitor';
import { InfraDashboard } from './components/InfraDashboard';
import { LoginPage } from './components/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  clearToken,
  getEnvironment,
  getEnvironmentConfig,
  getEnvironmentOptions,
  getToken,
  setEnvironment as persistEnvironment,
  type ApiEnvironment,
} from './hooks/useApi';
import type { Call } from './types';
import './App.css';

type AppMode = 'history' | 'live' | 'infra';
type ViewMode = 'analysis' | 'context' | 'timeline' | 'observer' | 'metrics';

export default function App() {
  const [environment, setEnvironmentState] = useState<ApiEnvironment>(getEnvironment());
  const [authenticated, setAuthenticated] = useState<boolean>(!!getToken(environment));
  const [appMode, setAppMode] = useState<AppMode>('history');
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('context');
  const environmentConfig = getEnvironmentConfig(environment);
  const dateStrip = useMemo(() => buildDateStrip(), []);

  useEffect(() => {
    setAuthenticated(!!getToken(environment));
  }, [environment]);

  function handleEnvironmentChange(nextEnvironment: ApiEnvironment) {
    persistEnvironment(nextEnvironment);
    setEnvironmentState(nextEnvironment);
    setSelectedCall(null);
    setAuthenticated(!!getToken(nextEnvironment));
  }

  if (!authenticated) {
    return (
      <LoginPage
        environment={environment}
        onEnvironmentChange={handleEnvironmentChange}
        onLogin={() => setAuthenticated(true)}
      />
    );
  }

  function handleLogout() {
    clearToken(environment);
    setAuthenticated(false);
  }

  return (
    <div className="app">
      <aside className="app-rail" aria-label="Primary navigation">
        <div className={`rail-mark rail-mark-${environment}`} title={`${environmentConfig.label} data`}>
          {environmentConfig.label.slice(0, 1)}
        </div>
        <nav className="rail-nav">
          <button
            type="button"
            aria-label="History"
            title="History"
            className={appMode === 'history' ? 'active' : ''}
            onClick={() => setAppMode('history')}
          >
            H
          </button>
          <button
            type="button"
            aria-label="Live calls"
            title="Live calls"
            className={appMode === 'live' ? 'active' : ''}
            onClick={() => setAppMode('live')}
          >
            L
          </button>
          <button
            type="button"
            aria-label="Infrastructure"
            title="Infrastructure"
            className={appMode === 'infra' ? 'active' : ''}
            onClick={() => setAppMode('infra')}
          >
            I
          </button>
        </nav>
        <button className="rail-logout" type="button" onClick={handleLogout} aria-label="Log out">
          Out
        </button>
      </aside>

      <main className="workspace">
        <header className="app-header">
          <div className="title-lockup">
            <span className="subtitle">Internal Observability</span>
            <h1>Today</h1>
          </div>

          <div className="header-actions">
            <div className="environment-toggle" role="group" aria-label="Select data environment">
              {getEnvironmentOptions().map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={environment === option.key ? 'active' : ''}
                  onClick={() => handleEnvironmentChange(option.key)}
                  title={option.apiRoot}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="calendar-strip" aria-label="Current week">
          <button type="button" aria-label="Previous week" className="calendar-arrow">&lt;</button>
          <div className="calendar-month">
            {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date())}
          </div>
          <div className="calendar-days">
            {dateStrip.map(day => (
              <div className={`calendar-day ${day.isToday ? 'today' : ''}`} key={day.iso}>
                <span>{day.weekday}</span>
                <strong>{day.day}</strong>
              </div>
            ))}
          </div>
          <button type="button" aria-label="Next week" className="calendar-arrow">&gt;</button>
        </section>

        <section className="mode-section">
          <div>
            <h2>{getModeTitle(appMode)}</h2>
            <p>{environmentConfig.label} data from {shortHost(environmentConfig.apiRoot)}</p>
          </div>
          <div className="app-mode-toggle">
            <button
              type="button"
              className={appMode === 'history' ? 'active' : ''}
              onClick={() => setAppMode('history')}
            >
              History
            </button>
            <button
              type="button"
              className={appMode === 'live' ? 'active' : ''}
              onClick={() => setAppMode('live')}
            >
              <span className="live-dot" />
              Live
            </button>
            <button
              type="button"
              className={appMode === 'infra' ? 'active' : ''}
              onClick={() => setAppMode('infra')}
            >
              Infra
            </button>
          </div>
        </section>

        <div className="mode-content" key={`${environment}-${appMode}`}>
          <ErrorBoundary resetKey={`${environment}-${appMode}-${selectedCall?.id || 'none'}-${viewMode}`}>
            {appMode === 'live' ? (
              <LiveCallMonitor />
            ) : appMode === 'infra' ? (
              <div className="infra-content">
                <InfraDashboard />
              </div>
            ) : (
          <div className="app-content">
            <aside className="sidebar">
              <CallList
                onSelectCall={setSelectedCall}
                selectedCallId={selectedCall?.id}
              />
            </aside>

            <section className="main-panel">
              {selectedCall ? (
                <>
                  <div className="call-header">
                    <div className="call-info-block">
                      <div className="call-info">
                        <h2>{selectedCall.senior_name || 'Unknown Senior'}</h2>
                        <span className="call-phone">{selectedCall.senior_phone}</span>
                        <span className={`call-status status-${selectedCall.status}`}>
                          {selectedCall.status.replace('_', ' ')}
                        </span>
                      </div>
                      {selectedCall.summary && (
                        <p className="call-summary-preview">{selectedCall.summary}</p>
                      )}
                    </div>
                    <div className="view-toggle">
                      <button
                        type="button"
                        className={viewMode === 'analysis' ? 'active' : ''}
                        onClick={() => setViewMode('analysis')}
                      >
                        Analysis
                      </button>
                      <button
                        type="button"
                        className={viewMode === 'context' ? 'active' : ''}
                        onClick={() => setViewMode('context')}
                      >
                        Context
                      </button>
                      <button
                        type="button"
                        className={viewMode === 'timeline' ? 'active' : ''}
                        onClick={() => setViewMode('timeline')}
                      >
                        Timeline
                      </button>
                      <button
                        type="button"
                        className={viewMode === 'observer' ? 'active' : ''}
                        onClick={() => setViewMode('observer')}
                      >
                        Observer
                      </button>
                      <button
                        type="button"
                        className={viewMode === 'metrics' ? 'active' : ''}
                        onClick={() => setViewMode('metrics')}
                      >
                        Metrics
                      </button>
                    </div>
                  </div>

                  <div className="call-content">
                    {viewMode === 'analysis' ? (
                      <AnalysisPanel call={selectedCall} />
                    ) : viewMode === 'context' ? (
                      <ContextPanel callId={selectedCall.id} />
                    ) : viewMode === 'timeline' ? (
                      <CallTimeline callId={selectedCall.id} />
                    ) : viewMode === 'observer' ? (
                      <ObserverPanel callId={selectedCall.id} />
                    ) : (
                      <MetricsPanel callId={selectedCall.id} />
                    )}
                  </div>
                </>
              ) : (
                <div className="no-selection">
                  <div className="no-selection-content">
                    <span className="no-selection-icon" aria-hidden="true" />
                    <h2>Select a call</h2>
                    <p>Choose a call from the list to view context, analysis, timeline, observer, and metrics.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
            )}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function getModeTitle(mode: AppMode): string {
  if (mode === 'live') return 'Live Calls';
  if (mode === 'infra') return 'Life Pulse';
  return 'Decisions';
}

function buildDateStrip() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + 1);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: date.toISOString(),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      day: date.getDate(),
      isToday: date.toDateString() === today.toDateString(),
    };
  });
}

function shortHost(apiRoot: string): string {
  try {
    return new URL(apiRoot).hostname.replace(/^www\./, '');
  } catch {
    return apiRoot;
  }
}
