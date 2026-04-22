import { useState } from 'react';

const INTERESTS = [
  { id: 'sports', label: 'Sports', question: 'Which teams or players do they follow?', placeholder: 'e.g., Detroit Lions, 1980s Celtics, Serena Williams' },
  { id: 'history', label: 'History', question: 'Which eras or events interest them most?', placeholder: 'e.g., World War II, Ancient Rome, Civil Rights Movement' },
  { id: 'music', label: 'Music', question: 'What genres or artists do they enjoy?', placeholder: 'e.g., Frank Sinatra, jazz, classical piano' },
  { id: 'film', label: 'Film', question: 'What genres or movies do they enjoy?', placeholder: 'e.g., old westerns, Audrey Hepburn films, comedies' },
  { id: 'politics', label: 'Politics', question: 'What topics or figures interest them?', placeholder: 'e.g., local politics, presidential history' },
  { id: 'poetry', label: 'Poetry', question: 'Any favorite poets or styles?', placeholder: 'e.g., Robert Frost, haiku, Shakespeare sonnets' },
  { id: 'geography', label: 'Geography', question: 'Any favorite places or regions?', placeholder: 'e.g., the Mediterranean, national parks, Japan' },
  { id: 'animals', label: 'Animals', question: 'Do they have pets or favorite animals?', placeholder: 'e.g., golden retriever named Max, loves birds' },
  { id: 'literature', label: 'Literature', question: 'What genres or authors do they enjoy?', placeholder: 'e.g., mystery novels, Agatha Christie, biographies' },
  { id: 'gardening', label: 'Gardening', question: 'What plants or gardening activities do they enjoy?', placeholder: 'e.g., roses, vegetable garden, orchids' },
  { id: 'travel', label: 'Travel', question: 'Where have they traveled or want to go?', placeholder: 'e.g., visited Italy in 1985, dreams of Alaska' },
  { id: 'cooking', label: 'Cooking', question: 'What cuisines or dishes do they enjoy?', placeholder: 'e.g., Italian recipes, baking bread, Southern comfort food' },
];

function InterestIcon({ id, size = 28, color = 'currentColor' }) {
  const s = { width: size, height: size, strokeWidth: 1.5, stroke: color, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'sports': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
    );
    case 'history': return (
      <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    );
    case 'music': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
    );
    case 'film': return (
      <svg viewBox="0 0 24 24" {...s}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg>
    );
    case 'politics': return (
      <svg viewBox="0 0 24 24" {...s}><line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 2 20 7 4 7" /></svg>
    );
    case 'poetry': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" /></svg>
    );
    case 'geography': return (
      <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
    );
    case 'animals': return (
      <svg viewBox="0 0 24 24" {...s}><circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="20" cy="16" r="2" /><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" /></svg>
    );
    case 'literature': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
    );
    case 'gardening': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 17 3.5s1.5 2.5-.5 6.5c-1.1 2.2-2.6 3.8-4.2 4.8" /><path d="M11.2 12.7c-1.6-1-3.1-2.6-4.2-4.8C5 3.9 6.5 1.4 6.5 1.4S8 2.8 13.7 4.8" /><path d="M12 20v-8" /></svg>
    );
    case 'travel': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>
    );
    case 'cooking': return (
      <svg viewBox="0 0 24 24" {...s}><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" /><line x1="6" y1="17" x2="18" y2="17" /></svg>
    );
    default: return null;
  }
}

export default function Step6_Interests({ data, update }) {
  const interests = data.interests || {};
  const [expandedId, setExpandedId] = useState(null);
  const [draftDetail, setDraftDetail] = useState('');

  const selectedIds = INTERESTS.filter((i) => interests[i.id]?.selected).map((i) => i.id);
  const unselectedInterests = INTERESTS.filter((i) => !interests[i.id]?.selected);

  const handleTileClick = (interest) => {
    if (interests[interest.id]?.selected) return; // already selected, use X to remove
    setExpandedId(interest.id);
    setDraftDetail(interests[interest.id]?.detail || '');
  };

  const handleDone = () => {
    if (!expandedId) return;
    update({
      interests: {
        ...interests,
        [expandedId]: { selected: true, detail: draftDetail },
      },
    });
    setExpandedId(null);
    setDraftDetail('');
  };

  const handleClose = () => {
    setExpandedId(null);
    setDraftDetail('');
  };

  const handleRemove = (id, e) => {
    e.stopPropagation();
    const updated = { ...interests };
    delete updated[id];
    update({ interests: updated });
  };

  const expandedInterest = expandedId ? INTERESTS.find((i) => i.id === expandedId) : null;

  return (
    <div>
      <h1 className="ob-step-title">Interests</h1>
      <p className="ob-step-subtitle">
        Select as many interests as you like. Donna can use these to spark engaging conversations.
      </p>

      {/* Expanded card */}
      {expandedInterest && (
        <div className="ob-interest-expanded">
          <div className="ob-interest-expanded__header">
            <InterestIcon id={expandedInterest.id} size={24} color="white" />
            <span className="ob-interest-expanded__title">{expandedInterest.label}</span>
            <button
              type="button"
              className="ob-interest-expanded__close"
              onClick={handleClose}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="ob-interest-expanded__question">{expandedInterest.question}</p>
          <input
            type="text"
            className="ob-interest-expanded__input"
            value={draftDetail}
            onChange={(e) => setDraftDetail(e.target.value)}
            placeholder={expandedInterest.placeholder}
            autoFocus
          />
          <button
            type="button"
            className="ob-interest-expanded__done"
            onClick={handleDone}
          >
            Done
          </button>
        </div>
      )}

      {/* Selected tiles */}
      {selectedIds.length > 0 && (
        <div className="ob-interest-grid">
          {selectedIds.map((id) => {
            const interest = INTERESTS.find((i) => i.id === id);
            return (
              <div key={id} className="ob-interest-tile ob-interest-tile--selected">
                <button
                  type="button"
                  className="ob-interest-tile__remove"
                  onClick={(e) => handleRemove(id, e)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <div className="ob-interest-tile__icon">
                  <InterestIcon id={id} size={28} color="white" />
                </div>
                <div className="ob-interest-tile__name">{interest.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unselected tiles */}
      {unselectedInterests.length > 0 && (
        <div className={`ob-interest-grid${selectedIds.length > 0 ? ' ob-interest-grid--gap' : ''}`}>
          {unselectedInterests.map((interest) => (
            <button
              key={interest.id}
              type="button"
              className="ob-interest-tile"
              onClick={() => handleTileClick(interest)}
            >
              <div className="ob-interest-tile__icon">
                <InterestIcon id={interest.id} size={28} color="#666" />
              </div>
              <div className="ob-interest-tile__name">{interest.label}</div>
            </button>
          ))}
        </div>
      )}

      <div className="ob-form-group" style={{ marginTop: 28 }}>
        <label className="ob-label">Any additional interests or topics?</label>
        <textarea
          className="ob-textarea"
          value={data.additionalTopics || ''}
          onChange={(e) => update({ additionalTopics: e.target.value })}
          placeholder="e.g., She loves talking about her golden retriever, Max, and reminiscing about her years living in San Francisco."
          rows={3}
        />
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Topics to avoid</label>
        <textarea
          className="ob-textarea"
          value={data.topicsToAvoid || ''}
          onChange={(e) => update({ topicsToAvoid: e.target.value })}
          placeholder="Anything Donna should steer clear of..."
          rows={2}
        />
      </div>
    </div>
  );
}
