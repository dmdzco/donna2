import { useState, useMemo } from 'react';

const POPULAR_CITIES = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Miami', state: 'FL' },
];

// A selection of US cities for autocomplete
const US_CITIES = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Philadelphia', state: 'PA' },
  { city: 'San Antonio', state: 'TX' },
  { city: 'San Diego', state: 'CA' },
  { city: 'Dallas', state: 'TX' },
  { city: 'San Jose', state: 'CA' },
  { city: 'Austin', state: 'TX' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Fort Worth', state: 'TX' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'San Francisco', state: 'CA' },
  { city: 'Indianapolis', state: 'IN' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Denver', state: 'CO' },
  { city: 'Washington', state: 'DC' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Oklahoma City', state: 'OK' },
  { city: 'El Paso', state: 'TX' },
  { city: 'Boston', state: 'MA' },
  { city: 'Portland', state: 'OR' },
  { city: 'Las Vegas', state: 'NV' },
  { city: 'Memphis', state: 'TN' },
  { city: 'Louisville', state: 'KY' },
  { city: 'Baltimore', state: 'MD' },
  { city: 'Milwaukee', state: 'WI' },
  { city: 'Albuquerque', state: 'NM' },
  { city: 'Tucson', state: 'AZ' },
  { city: 'Fresno', state: 'CA' },
  { city: 'Sacramento', state: 'CA' },
  { city: 'Miami', state: 'FL' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Orlando', state: 'FL' },
  { city: 'St. Louis', state: 'MO' },
  { city: 'Pittsburgh', state: 'PA' },
  { city: 'Cincinnati', state: 'OH' },
  { city: 'Cleveland', state: 'OH' },
  { city: 'Minneapolis', state: 'MN' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Salt Lake City', state: 'UT' },
  { city: 'Detroit', state: 'MI' },
  { city: 'Honolulu', state: 'HI' },
  { city: 'Boise', state: 'ID' },
];

export default function Step3_Location({ data, update }) {
  const [query, setQuery] = useState(data.city ? `${data.city}, ${data.state}` : '');
  const [showResults, setShowResults] = useState(false);

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return US_CITIES.filter(
      (c) => c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [query]);

  const selectCity = (c) => {
    update({ city: c.city, state: c.state });
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
            // Clear selection if user edits
            if (data.city) update({ city: '', state: '' });
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Search for a city..."
        />
        {showResults && results.length > 0 && (
          <div className="ob-city-results">
            {results.map((c) => (
              <button
                key={`${c.city}-${c.state}`}
                className="ob-city-result"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCity(c)}
              >
                {c.city}, {c.state}
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
