import PhoneInput from './PhoneInput';

export default function Step1_AboutYou({ data, update }) {
  return (
    <div>
      <h1 className="ob-step-title">About <em className="ob-step-title__accent">you.</em></h1>
      <p className="ob-step-subtitle">
        Tell us a bit about yourself so we can personalize the experience.
      </p>

      <div className="ob-form-row">
        <div className="ob-form-group">
          <label className="ob-label">First name</label>
          <input
            className="ob-input"
            type="text"
            value={data.firstName}
            onChange={(e) => update({ firstName: e.target.value })}
            placeholder="Jane"
          />
        </div>
        <div className="ob-form-group">
          <label className="ob-label">Last name</label>
          <input
            className="ob-input"
            type="text"
            value={data.lastName}
            onChange={(e) => update({ lastName: e.target.value })}
            placeholder="Doe"
          />
        </div>
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Email</label>
        <input
          className="ob-input"
          type="email"
          value={data.email}
          onChange={(e) => update({ email: e.target.value })}
          placeholder="you@email.com"
        />
      </div>

      <div className="ob-form-group">
        <label className="ob-label">Phone number</label>
        <PhoneInput
          value={data.phone}
          onChange={(val) => update({ phone: val })}
          countryCode={data.phoneCountryCode || '+1'}
          onCountryCodeChange={(code) => update({ phoneCountryCode: code })}
        />
      </div>
    </div>
  );
}
