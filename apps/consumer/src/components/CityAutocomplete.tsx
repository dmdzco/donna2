import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { CityEntry } from '../data/us-cities';
import './CityAutocomplete.css';

interface Props {
  city: string;
  state: string;
  zip: string;
  onCityChange: (city: string) => void;
  onStateChange: (state: string) => void;
  onZipChange: (zip: string) => void;
}

// Lazy-load the dataset so it lands in its own Vite chunk
const dataPromise = import('../data/us-cities');

export default function CityAutocomplete({ city, state, zip, onCityChange, onStateChange, onZipChange }: Props) {
  const [cities, setCities] = useState<CityEntry[]>([]);
  const [states, setStates] = useState<{ abbr: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load dataset once
  useEffect(() => {
    dataPromise.then(mod => {
      setCities(mod.US_CITIES);
      setStates(mod.US_STATES);
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const matches = useMemo(() => {
    if (!city || city.length < 2 || cities.length === 0) return [];
    const q = city.toLowerCase();
    return cities
      .filter(c => c.city.toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [city, cities]);

  const handleSelect = useCallback((entry: CityEntry) => {
    onCityChange(entry.city);
    onStateChange(entry.state);
    onZipChange(entry.zip);
    setOpen(false);
  }, [onCityChange, onStateChange, onZipChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => (h - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(matches[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const highlightMatch = (text: string) => {
    const matchLen = city.length;
    return (
      <>
        <span className="city-option-match">{text.slice(0, matchLen)}</span>
        {text.slice(matchLen)}
      </>
    );
  };

  return (
    <div className="location-grid-auto">
      <div className="city-autocomplete" ref={wrapRef}>
        <input
          ref={inputRef}
          type="text"
          placeholder="City"
          value={city}
          onChange={e => {
            onCityChange(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => { if (matches.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {open && matches.length > 0 && (
          <div className="city-dropdown">
            {matches.map((entry, i) => (
              <div
                key={`${entry.city}-${entry.state}-${entry.zip}`}
                className={`city-option ${i === highlighted ? 'highlighted' : ''}`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(entry); }}
              >
                <span className="city-option-name">{highlightMatch(entry.city)}</span>
                <span className="city-option-detail">{entry.state} {entry.zip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <select
        value={state}
        onChange={e => onStateChange(e.target.value)}
      >
        <option value="">State</option>
        {states.map(s => (
          <option key={s.abbr} value={s.abbr}>{s.abbr}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Zip"
        value={zip}
        onChange={e => onZipChange(e.target.value)}
      />
    </div>
  );
}
