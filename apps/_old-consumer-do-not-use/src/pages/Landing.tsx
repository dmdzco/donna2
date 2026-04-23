import { useState } from 'react';
import { Phone, Heart, Clock, CheckCircle, Smile, Star } from 'lucide-react';
import seniorGardening from '../assets/senior_gardening.jpg';
import seniorOnPhone from '../assets/senior_on_phone.png';

const API_URL = import.meta.env.VITE_API_URL || '';

// TODO: Replace with real App Store / Google Play URLs when the app is published
const APP_STORE_URL = '#';
const PLAY_STORE_URL = '#';

function AppStoreButtons({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <a
        href={APP_STORE_URL}
        className="inline-flex items-center gap-2 bg-text-primary text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        App Store
      </a>
      <a
        href={PLAY_STORE_URL}
        className="inline-flex items-center gap-2 bg-text-primary text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3.18 23.76c.35.2.74.24 1.12.14l11.73-11.73L12.56 9l-9.38 14.76zm17.16-10.4L17.6 11.8l-3.12 3.12 3.12 3.12 2.76-1.57c.79-.45.79-1.47-.02-1.91zM3.03.47C2.67.68 2.43 1.07 2.43 1.56v20.88c0 .49.24.87.6 1.08l.07.04L14.43 12 3.1.43l-.07.04zm10.41 10.41L3.71.15C3.35.05 2.97.1 2.62.3L13.44 11.12l-.01-.24z" />
        </svg>
        Google Play
      </a>
    </div>
  );
}

function WaitlistForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setStatus('loading');
    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <p className="text-white/90 text-sm">
        You're on the list! We'll reach out when Donna is ready for you.
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 max-w-sm mx-auto">
        <input
          type="text"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1 px-4 py-2.5 rounded-xl text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-white"
        />
        <input
          type="email"
          placeholder="Email address"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 px-4 py-2.5 rounded-xl text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-white"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-5 py-2.5 rounded-xl bg-white text-sage-green font-semibold text-sm hover:bg-gray-100 transition-colors disabled:opacity-60"
        >
          {status === 'loading' ? 'Joining…' : 'Join'}
        </button>
      </form>
      {status === 'error' && (
        <p className="text-red-300 text-xs mt-2">Something went wrong. Try again.</p>
      )}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg-cream">
      {/* Navigation */}
      <nav aria-label="Main navigation" className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-8">
          <span className="text-sage-green font-bold text-xl">Donna</span>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#vision" className="hover:text-sage-green transition-colors">Our Vision</a>
            <a href="#how-it-works" className="hover:text-sage-green transition-colors">How it Works</a>
            <a href="/faq" className="hover:text-sage-green transition-colors">FAQ</a>
          </div>
          <a
            href={APP_STORE_URL}
            className="bg-text-primary text-white text-sm px-5 py-2 rounded-full font-semibold hover:bg-gray-800 transition-colors"
          >
            Download
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
            An AI Companion for<br />
            <span className="text-sage-green">Aging with Grace</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Donna calls your loved ones to offer them helpful reminders and chat about their day and lives,
            giving them independence and you peace of mind.
          </p>
          <AppStoreButtons className="justify-center" />
        </div>
      </section>

      {/* Help keeping up with the little things */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto bg-card-beige rounded-3xl p-8 md:p-14">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-6 leading-tight">
                Help keeping up with the little things
              </h2>
              <p className="text-gray-600 text-lg mb-8 leading-relaxed">
                From medication reminders to gentle exercise prompts, Donna weaves helpful nudges into
                natural conversation — so nothing important slips through the cracks.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Scheduled Daily Check-ins</h3>
                    <p className="text-gray-500 text-sm">Consistent, friendly calls at their preferred times</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Ad Hoc Reminders</h3>
                    <p className="text-gray-500 text-sm">Add reminders anytime — Donna delivers them naturally</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-first md:order-last">
              <img
                src={seniorGardening}
                alt="Elderly man watering plants in his garden"
                className="w-full h-80 md:h-[420px] object-cover rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* A brighter day — Our Vision */}
      <section id="vision" className="py-20 px-6">
        <div className="max-w-6xl mx-auto bg-sage-green/10 rounded-3xl p-8 md:p-14">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <img
                src={seniorOnPhone}
                alt="Senior person talking on the phone and smiling"
                className="w-full h-80 md:h-[420px] object-cover rounded-2xl"
              />
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-6 leading-tight">
                A brighter day could just be a conversation away
              </h2>
              <p className="text-gray-600 text-lg mb-8 leading-relaxed">
                Between visits and check-ins, there are long hours of silence. Donna fills those gaps with
                warm, meaningful conversation — so your loved one always has someone to talk to.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-accent-pink/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Heart className="w-5 h-5 text-accent-pink" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Loneliness is a public health crisis</h3>
                    <p className="text-gray-500 text-sm">As harmful as smoking 15 cigarettes per day</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Donna fills the gaps</h3>
                    <p className="text-gray-500 text-sm">Between check-ins with friendly companionship</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-accent-pink/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Smile className="w-5 h-5 text-accent-pink" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Meaningful conversations</h3>
                    <p className="text-gray-500 text-sm">About any topic they love</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Star className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Builds connection over time</h3>
                    <p className="text-gray-500 text-sm">By remembering past conversations</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block bg-sage-green/15 text-sage-green text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-12">
            <span className="text-sage-green">Simple Setup. Powerful Connection.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-card p-8">
              <div className="w-12 h-12 bg-sage-green/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-6 h-6 text-sage-green" />
              </div>
              <h3 className="text-xl font-bold mb-2">1. Build a Profile</h3>
              <p className="text-gray-600">
                Download the app and tell us about their interests and routine. Takes 3 minutes.
              </p>
            </div>
            <div className="glass-card p-8">
              <div className="w-12 h-12 bg-sage-green/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 text-sage-green" />
              </div>
              <h3 className="text-xl font-bold mb-2">2. Set the Schedule</h3>
              <p className="text-gray-600">
                Choose when Donna calls. They can call Donna too.
              </p>
            </div>
            <div className="glass-card p-8">
              <div className="w-12 h-12 bg-sage-green/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-6 h-6 text-sage-green" />
              </div>
              <h3 className="text-xl font-bold mb-2">3. Connect</h3>
              <p className="text-gray-600">
                Donna starts calling. You get reports on engagement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto bg-sage-green rounded-3xl p-12 md:p-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 leading-tight">
            Ready to give the gift of independence?
          </h2>
          <AppStoreButtons className="justify-center mb-10" />
          <p className="text-white/70 text-sm mb-3">Not available in your region yet?</p>
          <WaitlistForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-600">
          <span>&copy; 2026 Donna. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-sage-green">Privacy</a>
            <a href="#" className="hover:text-sage-green">Terms</a>
            <a href="#" className="hover:text-sage-green">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
