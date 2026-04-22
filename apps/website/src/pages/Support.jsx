import './LegalPage.css';

export default function Support() {
  return (
    <section className="legal-page">
      <div className="legal-page__container">
        <div className="legal-page__header">
          <h1 className="legal-page__title">Support</h1>
          <p className="legal-page__meta">Last Updated: April 22, 2026</p>
        </div>

        <div className="legal-page__body">
          <h2>Contact Donna</h2>
          <p>Email <a href="mailto:nick@calldonna.co">nick@calldonna.co</a> for account help, onboarding questions, privacy requests, cancellation requests, or app support.</p>

          <h2>Privacy-Safe Support</h2>
          <p>Please avoid sending medical details, full transcripts, medication lists, or other sensitive information by email unless we specifically ask for the minimum details needed to resolve your request.</p>

          <h2>Urgent Situations</h2>
          <p>Donna is not an emergency response service. If someone may be in immediate danger, call 911 or local emergency services.</p>
        </div>
      </div>
    </section>
  );
}
