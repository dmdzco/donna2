import { useState } from 'react';
import { CallList } from './components/CallList';
import { CallTimeline } from './components/CallTimeline';
import { ObserverPanel } from './components/ObserverPanel';
import { LiveCallMonitor } from './components/LiveCallMonitor';
import type { Call } from './types';
import './App.css';

type AppMode = 'history' | 'live';
type ViewMode = 'timeline' | 'observer';

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('history');
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

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
                </div>
              </div>

              {/* Content based on view mode */}
              <div className="call-content">
                {viewMode === 'timeline' ? (
                  <CallTimeline callId={selectedCall.id} />
                ) : (
                  <ObserverPanel callId={selectedCall.id} />
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
