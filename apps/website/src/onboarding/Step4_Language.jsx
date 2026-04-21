import { CheckIcon } from './icons';

export default function Step4_Language({ data, update }) {
  const name = data.lovedOneName || 'your loved one';

  return (
    <div>
      <h1 className="ob-step-title">Language.</h1>
      <p className="ob-step-subtitle">
        What language should Donna speak to {name} in?
      </p>

      <div className="ob-radio-cards">
        <button
          type="button"
          className={`ob-radio-card${data.language === 'english' ? ' ob-radio-card--selected' : ''}`}
          onClick={() => update({ language: 'english' })}
        >
          <div className="ob-radio-card__icon" style={{ background: '#EEF2FF' }}>
            <img src="https://flagcdn.com/40x30/us.png" alt="US" width="32" height="24" style={{ borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          <div className="ob-radio-card__text">
            <div className="ob-radio-card__title">English</div>
            <div className="ob-radio-card__desc">US English</div>
          </div>
          <div className="ob-radio-card__check">
            {data.language === 'english' && <CheckIcon size={14} />}
          </div>
        </button>

        <button
          type="button"
          className={`ob-radio-card${data.language === 'spanish' ? ' ob-radio-card--selected' : ''}`}
          onClick={() => update({ language: 'spanish' })}
        >
          <div className="ob-radio-card__icon" style={{ background: '#FEF3E2' }}>
            <img src="https://flagcdn.com/40x30/mx.png" alt="MX" width="32" height="24" style={{ borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          <div className="ob-radio-card__text">
            <div className="ob-radio-card__title">Spanish</div>
            <div className="ob-radio-card__desc">Español</div>
          </div>
          <div className="ob-radio-card__check">
            {data.language === 'spanish' && <CheckIcon size={14} />}
          </div>
        </button>
      </div>
    </div>
  );
}
