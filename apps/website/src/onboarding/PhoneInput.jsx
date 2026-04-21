import { useState, useRef, useEffect } from 'react';

const COUNTRY_CODES = [
  { code: '+1', label: 'US', flag: '🇺🇸' },
  { code: '+1', label: 'CA', flag: '🇨🇦' },
  { code: '+44', label: 'UK', flag: '🇬🇧' },
  { code: '+52', label: 'MX', flag: '🇲🇽' },
  { code: '+61', label: 'AU', flag: '🇦🇺' },
  { code: '+49', label: 'DE', flag: '🇩🇪' },
  { code: '+33', label: 'FR', flag: '🇫🇷' },
  { code: '+91', label: 'IN', flag: '🇮🇳' },
  { code: '+86', label: 'CN', flag: '🇨🇳' },
  { code: '+81', label: 'JP', flag: '🇯🇵' },
  { code: '+82', label: 'KR', flag: '🇰🇷' },
  { code: '+55', label: 'BR', flag: '🇧🇷' },
  { code: '+234', label: 'NG', flag: '🇳🇬' },
  { code: '+254', label: 'KE', flag: '🇰🇪' },
  { code: '+63', label: 'PH', flag: '🇵🇭' },
];

export default function PhoneInput({ value, onChange, placeholder = '(555) 123-4567', countryCode, onCountryCodeChange }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const dropdownRef = useRef(null);

  const selected = COUNTRY_CODES.find(
    (c) => c.code === countryCode && c.label === (countryCode === '+1' ? 'US' : c.label)
  ) || COUNTRY_CODES[0];

  // Check if current code is a custom one
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
          {isCustom ? '🌐' : <img src={`https://flagcdn.com/20x15/${selected.label.toLowerCase()}.png`} alt={selected.label} width="20" height="15" style={{ objectFit: 'contain' }} />}
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
              key={`${c.label}-${i}`}
              type="button"
              className="ob-phone-input__option"
              onClick={() => handleSelect(c)}
            >
              <img src={`https://flagcdn.com/20x15/${c.label.toLowerCase()}.png`} alt={c.label} width="20" height="15" style={{ objectFit: 'contain' }} />
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
