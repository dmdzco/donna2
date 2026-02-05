import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignInButton, useAuth } from '@clerk/clerk-react';
import { Phone, Heart, Bell } from 'lucide-react';

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
            <SignInButton mode="modal">
              <button className="text-sm text-sage-green hover:underline">Sign In</button>
            </SignInButton>
            <SignInButton mode="modal" forceRedirectUrl="/onboarding">
              <button className="btn-primary text-sm">Get Started</button>
            </SignInButton>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-card-beige px-4 py-2 rounded-full text-sm text-gray-600 mb-8">
            <span className="w-2 h-2 bg-accent-pink rounded-full"></span>
            Featured on TechCrunch & Forbes
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
            Stay Connected with<br />
            <span className="text-sage-green">Your Loved Ones</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Donna makes friendly phone calls to your elderly loved ones, providing companionship,
            medication reminders, and peace of mind for the whole family.
          </p>
          <div className="flex items-center justify-center gap-4">
            <SignInButton mode="modal" forceRedirectUrl="/onboarding">
              <button className="btn-primary text-lg px-8 py-4">
                Start Free Trial
              </button>
            </SignInButton>
            <a href="#how-it-works" className="btn-secondary text-lg px-8 py-4">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-sage-green">15k+</div>
              <div className="text-gray-600">Calls Made</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-sage-green">98%</div>
              <div className="text-gray-600">Satisfaction</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-sage-green">24/7</div>
              <div className="text-gray-600">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="vision" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-card p-8">
              <div className="w-12 h-12 bg-accent-pink/20 rounded-full flex items-center justify-center mb-4">
                <Phone className="w-6 h-6 text-accent-pink" />
              </div>
              <h3 className="text-xl font-bold mb-2">Daily Check-ins</h3>
              <p className="text-gray-600">
                Warm, conversational calls that make your loved ones feel cared for and connected.
              </p>
            </div>
            <div className="glass-card p-8">
              <div className="w-12 h-12 bg-sage-green/20 rounded-full flex items-center justify-center mb-4">
                <Bell className="w-6 h-6 text-sage-green" />
              </div>
              <h3 className="text-xl font-bold mb-2">Gentle Reminders</h3>
              <p className="text-gray-600">
                Medication and appointment reminders woven naturally into friendly conversation.
              </p>
            </div>
            <div className="glass-card p-8">
              <div className="w-12 h-12 bg-accent-pink/20 rounded-full flex items-center justify-center mb-4">
                <Heart className="w-6 h-6 text-accent-pink" />
              </div>
              <h3 className="text-xl font-bold mb-2">Peace of Mind</h3>
              <p className="text-gray-600">
                Get summaries and alerts so you always know how your loved one is doing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-6 bg-card-beige">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="w-12 h-12 bg-sage-green text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
              <h3 className="text-xl font-bold mb-2">Build a Profile</h3>
              <p className="text-gray-600">Tell us about your loved one's interests, schedule, and care needs.</p>
            </div>
            <div>
              <div className="w-12 h-12 bg-sage-green text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
              <h3 className="text-xl font-bold mb-2">Set the Schedule</h3>
              <p className="text-gray-600">Choose when Donna calls - daily, weekly, or custom times.</p>
            </div>
            <div>
              <div className="w-12 h-12 bg-sage-green text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
              <h3 className="text-xl font-bold mb-2">Stay Connected</h3>
              <p className="text-gray-600">Get updates after each call and rest easy knowing they're cared for.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of families who trust Donna to care for their loved ones.
          </p>
          <SignInButton mode="modal" forceRedirectUrl="/onboarding">
            <button className="btn-primary text-lg px-8 py-4">
              Start Your Free Trial
            </button>
          </SignInButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-600">
          <span>&copy; 2025 Donna. All rights reserved.</span>
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
