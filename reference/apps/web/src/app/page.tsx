import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <nav className="flex justify-between items-center mb-16">
          <h1 className="text-2xl font-bold text-primary-700">Donna</h1>
          <div className="space-x-4">
            <Link
              href="/login"
              className="text-primary-600 hover:text-primary-700"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
            >
              Get Started
            </Link>
          </div>
        </nav>

        <div className="text-center py-20">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            A Friendly Voice for Your Loved Ones
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Donna is an AI companion that calls your elderly family members,
            provides friendly conversation, and helps them remember important
            things like taking medication.
          </p>
          <Link
            href="/signup"
            className="bg-primary-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-primary-700 inline-block"
          >
            Start Free Trial
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <div className="text-4xl mb-4">📞</div>
            <h3 className="text-xl font-semibold mb-2">Daily Check-ins</h3>
            <p className="text-gray-600">
              Donna calls at convenient times for friendly conversation and
              wellness checks.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <div className="text-4xl mb-4">💊</div>
            <h3 className="text-xl font-semibold mb-2">Medication Reminders</h3>
            <p className="text-gray-600">
              Gentle reminders woven naturally into conversation, not robotic
              alerts.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <div className="text-4xl mb-4">👨‍👩‍👧</div>
            <h3 className="text-xl font-semibold mb-2">Family Dashboard</h3>
            <p className="text-gray-600">
              Review conversation summaries and get alerts about any concerns.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
