const INTEREST_OPTIONS = [
  { key: 'gardening', emoji: '🌱', label: 'Gardening' },
  { key: 'cooking', emoji: '🍳', label: 'Cooking' },
  { key: 'music', emoji: '🎵', label: 'Music' },
  { key: 'reading', emoji: '📚', label: 'Reading' },
  { key: 'sports', emoji: '⚾', label: 'Sports' },
  { key: 'movies', emoji: '🎬', label: 'Movies & TV' },
  { key: 'travel', emoji: '✈️', label: 'Travel' },
  { key: 'pets', emoji: '🐾', label: 'Pets' },
  { key: 'history', emoji: '🏛️', label: 'History' },
  { key: 'crafts', emoji: '🧶', label: 'Crafts' },
  { key: 'faith', emoji: '🙏', label: 'Faith' },
  { key: 'nature', emoji: '🌿', label: 'Nature' },
];

export default function Step6_Interests({ data, update }) {
  const interests = data.interests || {};

  const toggleInterest = (key) => {
    const current = interests[key] || { selected: false, detail: '' };
    update({
      interests: {
        ...interests,
        [key]: { ...current, selected: !current.selected },
      },
    });
  };

  const updateDetail = (key, detail) => {
    update({
      interests: {
        ...interests,
        [key]: { ...interests[key], detail },
      },
    });
  };

  return (
    <div>
      <h1 className="ob-step-title">Interests & hobbies</h1>
      <p className="ob-step-subtitle">
        Select topics your loved one enjoys. Donna will weave these into conversations naturally.
      </p>

      <div className="ob-interest-grid">
        {INTEREST_OPTIONS.map(({ key, emoji, label }) => {
          const isSelected = interests[key]?.selected;
          return (
            <div key={key}>
              <button
                type="button"
                className={`ob-interest-tile${isSelected ? ' ob-interest-tile--selected' : ''}`}
                onClick={() => toggleInterest(key)}
              >
                <div className="ob-interest-tile__emoji">{emoji}</div>
                <div className="ob-interest-tile__name">{label}</div>
              </button>
              {isSelected && (
                <div className="ob-interest-detail">
                  <input
                    type="text"
                    value={interests[key]?.detail || ''}
                    onChange={(e) => updateDetail(key, e.target.value)}
                    placeholder={`Details about ${label.toLowerCase()}...`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Additional topics</label>
        <textarea
          className="ob-textarea"
          value={data.additionalTopics || ''}
          onChange={(e) => update({ additionalTopics: e.target.value })}
          placeholder="Any other topics they enjoy talking about..."
          rows={2}
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
