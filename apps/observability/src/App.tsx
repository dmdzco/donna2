import { useState, useEffect } from 'react';
import { CallList } from './components/CallList';
import { CallTimeline } from './components/CallTimeline';
import { ObserverPanel } from './components/ObserverPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { LiveCallMonitor } from './components/LiveCallMonitor';
import { LoginPage } from './components/LoginPage';
import { getToken, clearToken } from './hooks/useApi';
import type { Call } from './types';
import './App.css';

type AppMode = 'history' | 'live';
type ViewMode = 'timeline' | 'observer' | 'metrics';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(!!getToken());
  const [appMode, setAppMode] = useState<AppMode>('history');
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  useEffect(() => {
    setAuthenticated(!!getToken());
  }, []);

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  function handleLogout() {
    clearToken();
    setAuthenticated(false);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Donna Observability</h1>
        <span className="subtitle">Call Flow & Observer Analysis</span>
        <div className="app-mode-toggle">
          <button
            className={appMode === 'history' ? 'active' : ''}
            onClick={() => setAppMode('history')}
          >
            History
          </button>
          <button
            className={appMode === 'live' ? 'active' : ''}
            onClick={() => setAppMode('live')}
          >
            <span className="live-dot" />
            Live
          </button>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {appMode === 'live' ? (
        <LiveCallMonitor />
      ) : (
      <div className="app-content">
        {/* Left Sidebar - Call List */}
        <aside className="sidebar">
          <CallList
            onSelectCall={setSelectedCall}
            selectedCallId={selectedCall?.id}
          />
        </aside>

        {/* Main Content Area */}
        <main className="main-panel">
          {selectedCall ? (
            <>
              {/* Call Info Header */}
              <div className="call-header">
                <div className="call-info">
                  <h2>{selectedCall.senior_name || 'Unknown Senior'}</h2>
                  <span className="call-phone">{selectedCall.senior_phone}</span>
                  <span className={`call-status status-${selectedCall.status}`}>
                    {selectedCall.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="view-toggle">
                  <button
                    className={viewMode === 'timeline' ? 'active' : ''}
                    onClick={() => setViewMode('timeline')}
                  >
                    Timeline
                  </button>
                  <button
                    className={viewMode === 'observer' ? 'active' : ''}
                    onClick={() => setViewMode('observer')}
                  >
                    Observer
                  </button>
                  <button
                    className={viewMode === 'metrics' ? 'active' : ''}
                    onClick={() => setViewMode('metrics')}
                  >
                    Metrics
                  </button>
                </div>
              </div>

              {/* Content based on view mode */}
              <div className="call-content">
                {viewMode === 'timeline' ? (
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
                <span className="no-selection-icon">📞</span>
                <h2>Select a call</h2>
                <p>Choose a call from the list to view its timeline and observer analysis</p>
              </div>
            </div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
