import { useState, useMemo, useEffect, useRef } from 'react';

const POPULAR_CITIES = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Miami', state: 'FL' },
];

export default function Step3_Location({ data, update }) {
  const [query, setQuery] = useState(data.city ? `${data.city}, ${data.state}` : '');
  const [showResults, setShowResults] = useState(false);
  const [allCities, setAllCities] = useState(null);
  const loadedRef = useRef(false);

  // Lazy-load the full city dataset on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    import('./us-cities.js').then((mod) => {
      setAllCities(mod.US_CITIES);
    });
  }, []);

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase().trim();

    // If we have the full dataset, search it; otherwise fall back to popular cities
    const cities = allCities || POPULAR_CITIES;

    const matches = [];
    const startsWithCity = [];
    const startsWithState = [];
    const containsMatch = [];
    const zipMatch = [];

    for (const c of cities) {
      const cityLower = c.city.toLowerCase();
      const stateLower = c.state.toLowerCase();

      if (cityLower === q || `${cityLower}, ${stateLower}` === q) {
        matches.push(c); // exact match first
      } else if (cityLower.startsWith(q)) {
        startsWithCity.push(c);
      } else if (stateLower.startsWith(q) || stateLower === q) {
        startsWithState.push(c);
      } else if (cityLower.includes(q)) {
        containsMatch.push(c);
      } else if (c.zip && c.zip.startsWith(q)) {
        zipMatch.push(c);
      }
    }

    return [...matches, ...startsWithCity, ...zipMatch, ...containsMatch, ...startsWithState].slice(0, 8);
  }, [query, allCities]);

  const selectCity = (c) => {
    update({ city: c.city, state: c.state, zipcode: c.zip || data.zipcode || '' });
    setQuery(`${c.city}, ${c.state}`);
    setShowResults(false);
  };

  return (
    <div>
      <h1 className="ob-step-title">About your <em className="ob-step-title__accent">loved one.</em></h1>
      <p className="ob-step-subtitle">
        Location: letting us know where your loved one lives helps ensure calls are delivered in the proper time zones and that Donna can answer related questions about things like the local weather and news.
      </p>

      <div className="ob-city-chips">
        {POPULAR_CITIES.map((c) => (
          <button
            key={c.city}
            type="button"
            className={`ob-chip${data.city === c.city ? ' ob-chip--selected' : ''}`}
            onClick={() => selectCity(c)}
          >
            {c.city}
          </button>
        ))}
      </div>

      <div className="ob-form-group ob-city-search">
        <label className="ob-label">City</label>
        <input
          className="ob-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
            if (data.city) update({ city: '', state: '', zipcode: '' });
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Search for a city or zip code..."
        />
        {showResults && results.length > 0 && (
          <div className="ob-city-results">
            {results.map((c, i) => (
              <button
                key={`${c.city}-${c.state}-${i}`}
                className="ob-city-result"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCity(c)}
              >
                <span>{c.city}, {c.state}</span>
                {c.zip && <span className="ob-city-result__zip">{c.zip}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Zip code</label>
        <input
          className="ob-input"
          type="text"
          value={data.zipcode}
          onChange={(e) => update({ zipcode: e.target.value })}
          placeholder="12345"
          maxLength={5}
          inputMode="numeric"
        />
      </div>
    </div>
  );
}
