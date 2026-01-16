'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { api, Senior, Reminder, Conversation } from '@/lib/api';

export default function SeniorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const seniorId = params.id as string;

  const [senior, setSenior] = useState<Senior | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    Promise.all([
      api.getSenior(seniorId),
      api.getReminders(seniorId),
      api.getConversations(seniorId),
    ])
      .then(([seniorData, remindersData, conversationsData]) => {
        setSenior(seniorData.senior);
        setReminders(remindersData.reminders);
        setConversations(conversationsData.conversations);
        setLoading(false);
      })
      .catch(() => {
        router.push('/dashboard');
      });
  }, [seniorId, router]);

  async function handleCall() {
    setCalling(true);
    try {
      await api.initiateCall(seniorId);
      alert('Call initiated! Donna is calling now.');
    } catch (err: any) {
      alert(err.message || 'Failed to initiate call');
    } finally {
      setCalling(false);
    }
  }

  if (loading || !senior) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/dashboard" className="text-primary-600 hover:text-primary-700">
            &larr; Back to Dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{senior.name}</h2>
              <p className="text-gray-500">{senior.phone}</p>
              {senior.location_city && (
                <p className="text-gray-600 mt-1">
                  {senior.location_city}, {senior.location_state}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Link
                href={`/seniors/${seniorId}/edit`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Edit
              </Link>
              <button
                onClick={handleCall}
                disabled={calling}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {calling ? 'Calling...' : 'Call Now'}
              </button>
            </div>
          </div>

          {senior.interests && senior.interests.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Interests</h4>
              <div className="flex flex-wrap gap-2">
                {senior.interests.map((interest) => (
                  <span
                    key={interest}
                    className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-sm"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reminders</h3>
              <Link
                href={`/seniors/${seniorId}/reminders/new`}
                className="text-primary-600 hover:text-primary-700 text-sm"
              >
                + Add Reminder
              </Link>
            </div>

            {reminders.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
                No reminders set up yet
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="bg-white rounded-lg shadow-sm p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {reminder.title}
                        </h4>
                        {reminder.description && (
                          <p className="text-gray-600 text-sm mt-1">
                            {reminder.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          reminder.type === 'medication'
                            ? 'bg-red-100 text-red-700'
                            : reminder.type === 'appointment'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {reminder.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Recent Conversations
              </h3>
              <Link
                href={`/seniors/${seniorId}/conversations`}
                className="text-primary-600 hover:text-primary-700 text-sm"
              >
                View All
              </Link>
            </div>

            {conversations.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
                No conversations yet
              </div>
            ) : (
              <div className="space-y-3">
                {conversations.slice(0, 5).map((conversation) => (
                  <Link
                    key={conversation.id}
                    href={`/conversations/${conversation.id}`}
                    className="block bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-900">
                          {new Date(conversation.started_at).toLocaleDateString()}
                        </p>
                        {conversation.summary && (
                          <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                            {conversation.summary}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          conversation.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : conversation.status === 'no_answer'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {conversation.status}
                      </span>
                    </div>
                    {conversation.duration_seconds && (
                      <p className="text-gray-500 text-xs mt-2">
                        {Math.round(conversation.duration_seconds / 60)} min
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
