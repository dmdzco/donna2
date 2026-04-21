import { CheckIcon } from './icons';

export default function Step4_Language({ data, update }) {
  return (
    <div>
      <h1 className="ob-step-title">Preferred language</h1>
      <p className="ob-step-subtitle">
        What language should Donna speak during calls?
      </p>

      <div className="ob-radio-cards">
        <button
          type="button"
          className={`ob-radio-card${data.language === 'english' ? ' ob-radio-card--selected' : ''}`}
          onClick={() => update({ language: 'english' })}
        >
          <div className="ob-radio-card__icon" style={{ background: '#EEF2FF' }}>
            🇺🇸
          </div>
          <div className="ob-radio-card__text">
            <div className="ob-radio-card__title">English</div>
            <div className="ob-radio-card__desc">Donna will speak in English</div>
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
            🇪🇸
          </div>
          <div className="ob-radio-card__text">
            <div className="ob-radio-card__title">Spanish</div>
            <div className="ob-radio-card__desc">Donna hablará en español</div>
          </div>
          <div className="ob-radio-card__check">
            {data.language === 'spanish' && <CheckIcon size={14} />}
          </div>
        </button>
      </div>
    </div>
  );
}
