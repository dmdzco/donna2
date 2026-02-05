import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

// Placeholder - will be fully implemented in Task #5
export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const totalSteps = 6;

  return (
    <div className="min-h-screen bg-bg-cream py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-sage-green font-bold text-2xl">Donna</span>
          <div className="flex items-center justify-center gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-8 rounded-full transition-colors ${
                  i + 1 <= step ? 'bg-sage-green' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <p className="text-gray-500 mt-2">Step {step} of {totalSteps}</p>
        </div>

        {/* Form Content */}
        <div className="glass-card p-8">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Tell us about yourself</h2>
              <p className="text-gray-600">We'll use this to personalize your experience.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Your Name</label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-sage-green focus:ring-1 focus:ring-sage-green outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Your Email</label>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-sage-green focus:ring-1 focus:ring-sage-green outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">About your loved one</h2>
              <p className="text-gray-600">Tell us about the person Donna will be calling.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Their Name</label>
                  <input
                    type="text"
                    placeholder="Enter their name"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-sage-green focus:ring-1 focus:ring-sage-green outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="(555) 555-5555"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-sage-green focus:ring-1 focus:ring-sage-green outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Relationship</label>
                  <select className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-sage-green focus:ring-1 focus:ring-sage-green outline-none">
                    <option>Mother</option>
                    <option>Father</option>
                    <option>Client</option>
                    <option>Other Loved One</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step >= 3 && step <= 5 && (
            <div className="space-y-6 text-center py-12">
              <h2 className="text-2xl font-bold">
                {step === 3 && "Reminders & Updates"}
                {step === 4 && "Interests & Topics"}
                {step === 5 && "Call Schedule"}
              </h2>
              <p className="text-gray-500">
                Full implementation coming soon...
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6 text-center py-12">
              <div className="w-16 h-16 bg-sage-green rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold">You're all set!</h2>
              <p className="text-gray-600">
                Donna is ready to start calling your loved one.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < 6 && (
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              className="flex items-center gap-2 text-gray-600 hover:text-sage-green disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => setStep(Math.min(totalSteps, step + 1))}
              className="btn-primary flex items-center gap-2"
            >
              {step === 5 ? 'Complete Setup' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
