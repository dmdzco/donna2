import { useState, useRef, useEffect } from 'react';

const COUNTRY_CODES = [
  { code: '+1', iso: 'us', name: 'United States' },
  { code: '+1', iso: 'ca', name: 'Canada' },
  { code: '+44', iso: 'gb', name: 'United Kingdom' },
  { code: '+52', iso: 'mx', name: 'Mexico' },
  { code: '+61', iso: 'au', name: 'Australia' },
  { code: '+49', iso: 'de', name: 'Germany' },
  { code: '+33', iso: 'fr', name: 'France' },
  { code: '+91', iso: 'in', name: 'India' },
  { code: '+86', iso: 'cn', name: 'China' },
  { code: '+81', iso: 'jp', name: 'Japan' },
  { code: '+82', iso: 'kr', name: 'South Korea' },
  { code: '+55', iso: 'br', name: 'Brazil' },
  { code: '+234', iso: 'ng', name: 'Nigeria' },
  { code: '+254', iso: 'ke', name: 'Kenya' },
  { code: '+63', iso: 'ph', name: 'Philippines' },
];

function FlagImg({ iso, size = 24, circle = false }) {
  const px = size * 2; // 2x for retina
  const style = circle
    ? { width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }
    : { width: size, height: Math.round(size * 0.75), objectFit: 'cover', display: 'block', borderRadius: 2 };
  return (
    <img
      src={`https://flagcdn.com/w${px}/${iso}.png`}
      srcSet={`https://flagcdn.com/w${px * 2}/${iso}.png 2x`}
      alt={iso.toUpperCase()}
      style={style}
    />
  );
}

export default function PhoneInput({ value, onChange, placeholder = '(555) 123-4567', countryCode, onCountryCodeChange }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const dropdownRef = useRef(null);

  const selected = COUNTRY_CODES.find(
    (c) => c.code === countryCode && c.iso === (countryCode === '+1' ? 'us' : c.iso)
  ) || COUNTRY_CODES[0];

  const isCustom = !COUNTRY_CODES.some((c) => c.code === countryCode) && countryCode && countryCode !== '+1';

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setCustomMode(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (c) => {
    onCountryCodeChange(c.code);
    setOpen(false);
    setCustomMode(false);
  };

  const handleCustomSubmit = () => {
    const val = customValue.startsWith('+') ? customValue : '+' + customValue;
    if (val.length >= 2) {
      onCountryCodeChange(val);
      setOpen(false);
      setCustomMode(false);
      setCustomValue('');
    }
  };

  return (
    <div className="ob-phone-input" ref={dropdownRef}>
      <button
        type="button"
        className="ob-phone-input__code"
        onClick={() => { setOpen(!open); setCustomMode(false); }}
      >
        <span className="ob-phone-input__flag">
          {isCustom ? '🌐' : <FlagImg iso={selected.iso} size={20} />}
        </span>
        <span className="ob-phone-input__dial">
          {isCustom ? countryCode : selected.code}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ marginLeft: 2, opacity: 0.5 }}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <input
        className="ob-phone-input__number"
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {open && (
        <div className="ob-phone-input__dropdown">
          {COUNTRY_CODES.map((c, i) => (
            <button
              key={`${c.iso}-${i}`}
              type="button"
              className="ob-phone-input__option"
              onClick={() => handleSelect(c)}
            >
              <FlagImg iso={c.iso} size={22} />
              <span style={{ color: '#888', marginLeft: 'auto' }}>{c.code}</span>
            </button>
          ))}
          <div className="ob-phone-input__divider" />
          {customMode ? (
            <div className="ob-phone-input__custom-row">
              <input
                type="text"
                className="ob-phone-input__custom-input"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value.replace(/[^0-9+]/g, ''))}
                placeholder="+123"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              />
              <button
                type="button"
                className="ob-phone-input__custom-ok"
                onClick={handleCustomSubmit}
              >
                OK
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ob-phone-input__option ob-phone-input__option--custom"
              onClick={() => setCustomMode(true)}
            >
              <span>🌐</span>
              <span>Custom</span>
              <span style={{ color: '#888', marginLeft: 'auto', fontSize: '0.8em' }}>Enter code...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { FlagImg };
