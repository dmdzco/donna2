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

export default function Step2_LovedOne({ data, update }) {
  return (
    <div>
      <h1 className="ob-step-title">About your loved one</h1>
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
        <input
          className="ob-input"
          type="tel"
          value={data.lovedOnePhone}
          onChange={(e) => update({ lovedOnePhone: e.target.value })}
          placeholder="(555) 987-6543"
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
