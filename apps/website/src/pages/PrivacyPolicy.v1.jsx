import './LegalPage.css';

export default function PrivacyPolicy() {
  return (
    <section className="legal-page">
      <div className="legal-page__container">
        <div className="legal-page__header">
          <h1 className="legal-page__title">Privacy Policy</h1>
          <p className="legal-page__meta">Effective Date: March 28, 2026 &nbsp;·&nbsp; Last Updated: March 28, 2026</p>
        </div>

        <div className="legal-page__body">
          <h2>1. Introduction and Who We Are</h2>
          <p>Donna (&ldquo;Donna,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is an AI-powered companion calling service that provides scheduled, personalized phone calls to seniors on behalf of their family caregivers. We are operated by Donna, reachable at <a href="mailto:hello@calldonna.com">hello@calldonna.com</a>.</p>
          <p>This Privacy Policy explains how we collect, use, disclose, and protect information when you use our website (calldonna.co), mobile application, preview phone line, or otherwise interact with us. <strong>By using Donna, you agree to the practices described in this Policy.</strong></p>
          <div className="legal-page__notice">
            <strong>Important Disclosure:</strong> Calls made through our service are placed by an automated AI system, not a human. By providing a phone number and subscribing to Donna, the caregiver acknowledges this and consents on behalf of the senior to receive AI-generated companion calls.
          </div>
          <div className="legal-page__notice">
            <strong>Healthcare Disclaimer:</strong> Donna is not a healthcare provider, medical device, or HIPAA-covered entity. While caregivers may voluntarily share health-related information (such as medication schedules) to improve call personalization, Donna does not provide medical advice, diagnose conditions, or serve as a substitute for professional healthcare services. Information shared with Donna should not be considered protected health information (PHI) under HIPAA.
          </div>

          <h2>2. Information We Collect</h2>
          <h3>2.1 Information You Provide Directly</h3>
          <p><strong>Caregiver Account Information:</strong></p>
          <ul>
            <li>Full name and email address</li>
            <li>Phone number</li>
            <li>Payment information (processed securely by our third-party payment provider; we do not store full card numbers)</li>
          </ul>
          <p><strong>Senior / Call Recipient Information:</strong></p>
          <ul>
            <li>Name and preferred name</li>
            <li>Phone number</li>
            <li>Preferred call window and schedule</li>
            <li>Interests, hobbies, topics, and personal details you share to help personalize calls</li>
            <li>Reminders you configure (e.g., medication times, appointments, daily tasks)</li>
            <li>Health or lifestyle notes you voluntarily provide to improve call quality</li>
          </ul>
          <h3>2.2 Information Generated Through Service Use</h3>
          <ul>
            <li><strong>Call data:</strong> records of when calls were placed, duration, whether calls were answered, and retry attempts</li>
            <li><strong>Call recordings and transcripts:</strong> audio recordings and/or AI-generated transcripts of conversations between Donna and the Call Recipient, used to produce post-call summaries and improve service quality</li>
            <li><strong>Post-call summaries:</strong> AI-generated summaries of call content delivered to the Subscriber</li>
            <li><strong>Usage data:</strong> how you interact with our website, mobile application, and dashboard</li>
            <li><strong>Device and technical data:</strong> IP address, browser type, operating system, device identifiers, and referral source</li>
          </ul>
          <h3>2.3 Preview Phone Line</h3>
          <p>If you call our preview phone line without an account, we may collect your phone number and call metadata for the duration of the call. We do not permanently store personal information from preview calls unless you subsequently create an account. Preview calls may be recorded for quality assurance purposes, and recordings are automatically deleted within 30 days.</p>

          <h2>3. How We Use Your Information</h2>
          <ul>
            <li><strong>Provide the service:</strong> Set up, schedule, and deliver AI companion calls to Call Recipients</li>
            <li><strong>Personalize calls:</strong> Customize topics, greetings, reminders, and dialogue based on the Call Recipient&apos;s interests and history</li>
            <li><strong>Generate post-call summaries:</strong> Produce call summaries and transcripts for the Subscriber</li>
            <li><strong>Communicate with you:</strong> Send service updates, billing notifications, missed call alerts, and account information to Subscribers</li>
            <li><strong>Process payments:</strong> Charge the applicable subscription fee</li>
            <li><strong>Improve and develop the service:</strong> Analyze usage patterns, refine AI conversation quality, and enhance the overall experience</li>
            <li><strong>Ensure safety and compliance:</strong> Monitor for abuse, comply with legal obligations, and resolve disputes</li>
            <li><strong>Marketing (with consent):</strong> Send promotional communications only with your explicit consent; you may opt out at any time by clicking the unsubscribe link in any marketing email or contacting us</li>
          </ul>

          <h2>4. Call Recordings and Transcripts</h2>
          <p>To provide post-call summaries and continuously improve conversation quality, Donna may record and/or transcribe calls between the AI assistant and Call Recipients. By using the Service:</p>
          <ul>
            <li>The Subscriber acknowledges and consents to the recording and transcription of calls</li>
            <li>The Subscriber represents that they have informed the Call Recipient that calls may be recorded</li>
            <li>Recordings and transcripts are accessible only to the Subscriber through the app and to authorized Donna personnel for service operation</li>
            <li>Call recordings are retained for up to 90 days after the call date, after which they are automatically deleted</li>
            <li>Transcripts and summaries are retained for as long as the Subscriber&apos;s account is active</li>
          </ul>
          <p>We do not sell, share, or use call recordings or transcripts for advertising purposes.</p>

          <h2>5. License to Use Your Data</h2>
          <p>By using Donna, you grant Donna a non-exclusive, worldwide, royalty-free license to access, store, process, and use the information you provide — including information about your loved one — <strong>solely for the purposes described in this Privacy Policy</strong>: to operate, provide, improve, personalize, and develop the Donna service.</p>
          <p>This license does not permit us to sell, rent, or commercially exploit your personal information or your Call Recipient&apos;s personal information for any purpose unrelated to providing Donna&apos;s services to you. This license terminates when your account is deleted and data retention periods have expired.</p>

          <h2>6. How We Share Your Information</h2>
          <p>We take your privacy — and especially the privacy of the seniors in your care — seriously. <strong>We do not sell, rent, or share Call Recipients&apos; personal data with third parties for advertising, marketing, or any commercial purpose.</strong></p>
          <h3>6.1 Service Providers (Processors)</h3>
          <p>We work with trusted third-party vendors who help us operate the service, including:</p>
          <ul>
            <li>Telecommunications providers (e.g., Twilio) for call delivery</li>
            <li>Cloud infrastructure providers for data hosting and storage</li>
            <li>Payment processors (e.g., Stripe) for subscription billing</li>
            <li>AI service providers for conversation generation and analysis</li>
            <li>Authentication providers for secure account access</li>
          </ul>
          <p>All service providers are contractually obligated to use your data only to perform services for Donna and are prohibited from using it for any other purpose.</p>
          <h3>6.2 Legal Requirements</h3>
          <p>We may disclose information if required by law, court order, subpoena, or governmental authority, or to protect the rights, safety, or property of Donna, our users, or the public.</p>
          <h3>6.3 Business Transfers</h3>
          <p>If Donna is acquired by or merged with another company, your information may be transferred as part of that transaction. We will notify you at least 30 days before any such transfer and provide you with the opportunity to delete your account.</p>
          <h3>6.4 With Your Consent</h3>
          <p>We may share information for any other purpose with your explicit prior consent.</p>

          <h2>7. TCPA Consent and Automated Calls</h2>
          <p>By providing a Call Recipient&apos;s phone number and subscribing to Donna, the Subscriber represents and warrants that:</p>
          <ol>
            <li>They have the authority to authorize automated AI-generated calls to the Call Recipient&apos;s phone number</li>
            <li>The Call Recipient (or their legal representative) has been informed that calls will come from an AI system and has consented to receive them</li>
            <li>They will notify Donna immediately if the Call Recipient wishes to stop receiving calls</li>
            <li>They will update Donna if the Call Recipient&apos;s phone number changes</li>
          </ol>
          <p>You or the Call Recipient may stop all calls at any time by managing settings in the app or by contacting <a href="mailto:hello@calldonna.com">hello@calldonna.com</a>.</p>

          <h2>8. Data Security</h2>
          <p>We implement industry-standard security measures to protect your information, including:</p>
          <ul>
            <li>Encrypted data transmission (TLS/HTTPS) for all communications</li>
            <li>Encryption at rest for stored personal data</li>
            <li>Role-based access controls limiting who can access personal information</li>
            <li>Secure cloud infrastructure with regular security assessments</li>
          </ul>
          <p>No method of storage or transmission is 100% secure. In the event of a data breach affecting your personal information, we will notify affected users as required by applicable law, and in no case later than 72 hours after becoming aware of the breach.</p>

          <h2>9. Data Retention</h2>
          <p>We retain your personal information for as long as your account is active. Specific retention periods:</p>
          <ul>
            <li><strong>Account information:</strong> retained until account deletion, then deleted within 90 days</li>
            <li><strong>Call recordings:</strong> automatically deleted 90 days after the call</li>
            <li><strong>Transcripts and summaries:</strong> retained while your account is active; deleted within 90 days of account cancellation</li>
            <li><strong>Call metadata (dates, times, duration):</strong> retained for up to 12 months after your last active call for service quality and billing purposes</li>
            <li><strong>Payment records:</strong> retained as required by tax and financial regulations</li>
            <li><strong>Preview phone line data:</strong> automatically deleted within 30 days</li>
          </ul>
          <p>When you cancel your account, we will delete or anonymize your information within the timeframes specified above, except where retention is required for legal, tax, or compliance purposes.</p>

          <h2>10. Your Rights and Choices</h2>
          <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
            <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal retention requirements)</li>
            <li><strong>Portability:</strong> Request a copy of your data in a structured, machine-readable format</li>
            <li><strong>Opt out of marketing:</strong> Unsubscribe from promotional communications at any time</li>
            <li><strong>Withdraw consent:</strong> Withdraw consent for data processing where consent is the legal basis</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href="mailto:hello@calldonna.com">hello@calldonna.com</a>. We will respond within 30 days. We will not discriminate against you for exercising your rights.</p>
          <h3>California Residents (CCPA/CPRA)</h3>
          <p>Donna does not sell or share personal information for cross-context behavioral advertising. California residents may request disclosure of categories of personal information collected, the purposes for collection, and the categories of third parties with whom information is shared. You have the right to opt out of the sale or sharing of personal information and to request deletion of your data.</p>

          <h2>11. Children&apos;s Privacy</h2>
          <p>Donna&apos;s service is intended for seniors (adults) and is managed by adult family caregivers. We do not knowingly collect personal information from individuals under the age of 13. If you believe we have inadvertently collected information from a child under 13, please contact us immediately and we will delete it.</p>

          <h2>12. Third-Party Links</h2>
          <p>Our website or app may contain links to third-party websites or services that are not operated by Donna. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party service you interact with.</p>

          <h2>13. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the &ldquo;Last Updated&rdquo; date, post the revised policy on our website, and where appropriate, notify you by email at least 30 days before the changes take effect. Your continued use of Donna after any changes constitutes your acceptance of the updated policy.</p>

          <h2>14. Contact Us</h2>
          <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</p>
          <p>
            <strong>Donna</strong><br />
            Email: <a href="mailto:hello@calldonna.com">hello@calldonna.com</a><br />
            Website: calldonna.co
          </p>
        </div>
      </div>
    </section>
  );
}
