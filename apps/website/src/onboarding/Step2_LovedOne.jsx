const RELATIONSHIPS = [
  'Mother',
  'Father',
  'Grandmother',
  'Grandfather',
  'Spouse',
  'Aunt',
  'Uncle',
  'Friend',
  'Client',
  'Other',
];

import PhoneInput from './PhoneInput';

export default function Step2_LovedOne({ data, update }) {
  return (
    <div>
      <h1 className="ob-step-title">About your <em className="ob-step-title__accent">loved one.</em></h1>
      <p className="ob-step-subtitle">
        Tell us about the person Donna will be calling.
      </p>

      <div className="ob-form-group">
        <label className="ob-label">Their name</label>
        <input
          className="ob-input"
          type="text"
          value={data.lovedOneName}
          onChange={(e) => update({ lovedOneName: e.target.value })}
          placeholder="Margaret"
        />
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Their phone number</label>
        <PhoneInput
          value={data.lovedOnePhone}
          onChange={(val) => update({ lovedOnePhone: val })}
          countryCode={data.lovedOneCountryCode || '+1'}
          onCountryCodeChange={(code) => update({ lovedOneCountryCode: code })}
        />
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Your relationship</label>
        <select
          className="ob-select"
          value={data.relationship}
          onChange={(e) => update({ relationship: e.target.value })}
        >
          <option value="">Select relationship...</option>
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
