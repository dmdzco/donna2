'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, Senior } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    api.getSeniors().then((data) => {
      setSeniors(data.seniors);
      setLoading(false);
    }).catch(() => {
      router.push('/login');
    });
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary-700">Donna</h1>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-gray-600 hover:text-gray-800">
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-800"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Your Family Members</h2>
          <Link
            href="/seniors/new"
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
          >
            Add Family Member
          </Link>
        </div>

        {seniors.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">👴👵</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No family members yet
            </h3>
            <p className="text-gray-600 mb-6">
              Add an elderly family member to start providing them with
              companionship calls.
            </p>
            <Link
              href="/seniors/new"
              className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 inline-block"
            >
              Add Your First Family Member
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seniors.map((senior) => (
              <Link
                key={senior.id}
                href={`/seniors/${senior.id}`}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {senior.name}
                    </h3>
                    <p className="text-gray-500 text-sm">{senior.phone}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      senior.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {senior.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {senior.location_city && (
                  <p className="text-gray-600 text-sm mt-2">
                    {senior.location_city}, {senior.location_state}
                  </p>
                )}
                {senior.interests && senior.interests.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {senior.interests.slice(0, 3).map((interest) => (
                      <span
                        key={interest}
                        className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
