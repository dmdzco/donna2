const API_URL = 'https://donna-api-production-2450.up.railway.app';

export async function submitOnboarding(data, clerkToken) {
  // Transform frontend form data into the shape expected by POST /api/onboarding
  const interests = Object.entries(data.interests)
    .filter(([, v]) => v.selected)
    .map(([key, v]) => ({
      name: key,
      detail: v.detail || '',
    }));

  const reminders = data.reminders.map((r) => r.title).filter(Boolean);

  const callSchedule = data.calls.map((call) => ({
    title: call.title || 'Daily Check-in',
    frequency: call.frequency || 'daily',
    days: call.days || [],
    time: call.time || '10:00',
    reminderIds: call.reminderIds || [],
  }));

  const payload = {
    // Caregiver info
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    // Senior info
    seniorName: data.lovedOneName,
    seniorPhone: data.lovedOnePhone,
    relationship: data.relationship,
    // Location
    city: data.city,
    state: data.state,
    zipcode: data.zipcode,
    // Preferences
    language: data.language,
    reminders,
    interests,
    additionalTopics: data.additionalTopics,
    topicsToAvoid: data.topicsToAvoid,
    callSchedule,
  };

  const headers = {
    'Content-Type': 'application/json',
  };
  if (clerkToken) {
    headers['Authorization'] = `Bearer ${clerkToken}`;
  }

  const res = await fetch(`${API_URL}/api/onboarding`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new Error(body.message || 'An account with this phone number already exists.');
    }
    if (res.status === 422) {
      throw new Error(body.message || 'Please check your information and try again.');
    }
    throw new Error(body.message || 'Something went wrong. Please try again.');
  }

  return res.json();
}
