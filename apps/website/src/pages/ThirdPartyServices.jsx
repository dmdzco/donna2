import './LegalPage.css';

const providerGroups = [
  {
    title: 'Account, App, and Support',
    providers: [
      ['Clerk', 'Account sign-in, sign-up, authentication tokens, and caregiver identity data.'],
      ['Expo and Apple Push Notification service', 'Mobile app delivery infrastructure and push notification delivery metadata.'],
      ['Sentry', 'Crash reports, error diagnostics, and limited request metadata used to find and fix production issues.'],
      ['GrowthBook', 'Feature flag evaluation data used to control rollout of Donna features.'],
    ],
  },
  {
    title: 'Hosting and Data Storage',
    providers: [
      ['Vercel', 'Static website hosting and CDN delivery for calldonna.co.'],
      ['Railway', 'Application hosting for Donna API services and runtime logs.'],
      ['Neon', 'PostgreSQL database storage for account, senior, reminder, call, transcript, summary, and operational records.'],
    ],
  },
  {
    title: 'Calling, Speech, and AI',
    providers: [
      ['Telnyx', 'Phone number management, call delivery, real-time media streaming, and call metadata.'],
      ['Deepgram', 'Real-time speech-to-text transcription for call audio.'],
      ['Anthropic', 'Conversation generation and call context processing.'],
      ['Google Gemini', 'AI analysis, summarization, and fallback model processing depending on configuration.'],
      ['Groq', 'Conversation director and guidance model processing depending on configuration.'],
      ['OpenAI', 'Embeddings, search, and AI processing depending on configuration.'],
      ['ElevenLabs', 'Text-to-speech generation for Donna voice responses.'],
      ['Tavily', 'Web search queries when Donna needs current information during a call.'],
    ],
  },
  {
    title: 'Billing',
    providers: [
      ['Payment processor', 'Payment method and subscription billing data if paid billing is enabled. Donna does not store full card numbers.'],
    ],
  },
];

export default function ThirdPartyServices() {
  return (
    <section className="legal-page">
      <div className="legal-page__container">
        <div className="legal-page__header">
          <h1 className="legal-page__title">Third-Party Services</h1>
          <p className="legal-page__meta">Last Updated: April 22, 2026</p>
        </div>

        <div className="legal-page__body">
          <p>Donna uses the services below to operate the website, mobile app, phone calls, AI conversation pipeline, notifications, diagnostics, and account infrastructure. Providers may receive personal information only when needed for their role in the service.</p>
          <p>Donna does not sell personal information or share personal information for cross-context behavioral advertising.</p>

          {providerGroups.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.providers.map(([name, description]) => (
                  <li key={name}>
                    <strong>{name}:</strong> {description}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <h2>Changes</h2>
          <p>We update this page when material providers are added, removed, or their role changes. For questions, contact <a href="mailto:nick@calldonna.co">nick@calldonna.co</a>.</p>
        </div>
      </div>
    </section>
  );
}
