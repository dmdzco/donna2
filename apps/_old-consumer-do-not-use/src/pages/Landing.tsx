import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignInButton, useAuth } from '@clerk/clerk-react';
import { Phone, Heart, Clock, CheckCircle, Smile, Star } from 'lucide-react';
import seniorGardening from '../assets/senior_gardening.jpg';
import seniorOnPhone from '../assets/senior_on_phone.png';

export default function Landing() {
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '';

  // Only redirect signed-in users who have completed onboarding
  useEffect(() => {
    if (!isSignedIn) return;

    const checkProfile = async () => {
      setCheckingProfile(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/caregivers/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          // User has a profile, redirect to dashboard
          navigate('/dashboard');
        }
        // If 404, user needs onboarding - stay on landing page
      } catch (err) {
        // On error, stay on landing page
      } finally {
        setCheckingProfile(false);
      }
    };

    checkProfile();
  }, [isSignedIn, getToken, navigate, API_URL]);

  if (checkingProfile) {
    return (
      <div className="min-h-screen bg-bg-cream flex items-center justify-center">
        <div className="animate-pulse text-sage-green">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-cream">
      {/* Navigation */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-8">
          <span className="text-sage-green font-bold text-xl">Donna</span>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#vision" className="hover:text-sage-green transition-colors">Our Vision</a>
            <a href="#how-it-works" className="hover:text-sage-green transition-colors">How it Works</a>
            <a href="/faq" className="hover:text-sage-green transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <button
                className="bg-text-primary text-white text-sm px-5 py-2 rounded-full font-semibold hover:bg-gray-800 transition-colors"
                onClick={() => navigate('/onboarding')}
              >
                Complete Setup
              </button>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="text-sm text-sage-green hover:underline">Sign In</button>
                </SignInButton>
                <SignInButton mode="modal" forceRedirectUrl="/onboarding">
                  <button className="bg-text-primary text-white text-sm px-5 py-2 rounded-full font-semibold hover:bg-gray-800 transition-colors">
                    Get Started
                  </button>
                </SignInButton>
              </>
            )}
          </div>
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
          <div className="flex items-center justify-center">
            {isSignedIn ? (
              <button
                className="btn-primary text-lg px-8 py-4"
                onClick={() => navigate('/onboarding')}
              >
                Get Started
              </button>
            ) : (
              <SignInButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="btn-primary text-lg px-8 py-4">
                  Get Started
                </button>
              </SignInButton>
            )}
          </div>
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
                    <h4 className="font-semibold text-text-primary">Scheduled Daily Check-ins</h4>
                    <p className="text-gray-500 text-sm">Consistent, friendly calls at their preferred times</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary">Ad Hoc Reminders</h4>
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
                    <h4 className="font-semibold text-text-primary">Loneliness is a public health crisis</h4>
                    <p className="text-gray-500 text-sm">As harmful as smoking 15 cigarettes per day</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary">Donna fills the gaps</h4>
                    <p className="text-gray-500 text-sm">Between check-ins with friendly companionship</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-accent-pink/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Smile className="w-5 h-5 text-accent-pink" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary">Meaningful conversations</h4>
                    <p className="text-gray-500 text-sm">About any topic they love</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-sage-green/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Star className="w-5 h-5 text-sage-green" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary">Builds connection over time</h4>
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
                Tell us about their interests and routine. Takes 3 minutes.
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
          {isSignedIn ? (
            <button
              className="text-white text-lg px-8 py-4 rounded-full font-semibold border-2 border-white hover:bg-white hover:text-sage-green transition-colors"
              onClick={() => navigate('/onboarding')}
            >
              Start Your Free Trial
            </button>
          ) : (
            <SignInButton mode="modal" forceRedirectUrl="/onboarding">
              <button className="text-white text-lg px-8 py-4 rounded-full font-semibold border-2 border-white hover:bg-white hover:text-sage-green transition-colors">
                Start Your Free Trial
              </button>
            </SignInButton>
          )}
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
