# Admin Dashboard Design

**Date:** 2025-01-19
**Status:** Approved for implementation

## Overview

A new **Next.js admin dashboard** that runs parallel to the existing Donna voice pipeline, providing a modern interface for managing seniors and viewing call statistics.

## Goals

- Modern, accessible admin interface
- Clerk authentication (basic auth, no roles for MVP)
- Does not affect existing voice pipeline code
- Existing `admin.html` kept for quick debugging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PARALLEL SYSTEMS                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   donna-admin (NEW)              donna-agent-1 (EXISTING)   │
│   ┌─────────────────┐           ┌─────────────────────┐    │
│   │ Next.js App     │           │ Express Server      │    │
│   │ - Dashboard     │  ──API──► │ - Voice Pipeline    │    │
│   │ - Seniors Mgmt  │           │ - /api/* endpoints  │    │
│   │ - Clerk Auth    │           │ - admin.html        │    │
│   └─────────────────┘           └─────────────────────┘    │
│          │                              │                   │
│          ▼                              ▼                   │
│      Vercel                         Railway                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Auth | Clerk |
| Styling | Tailwind CSS |
| Hosting | Vercel |
| API | Existing Railway endpoints |

## Project Structure

```
donna-admin/                    # New directory (separate from donna-agent-1)
├── app/
│   ├── layout.tsx              # Root layout + Clerk provider
│   ├── page.tsx                # Dashboard (stats overview)
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── seniors/page.tsx        # Seniors list + add form
│   └── seniors/[id]/page.tsx   # Senior detail + memories
├── components/
│   ├── nav.tsx                 # Simple top navigation
│   └── ui.tsx                  # Basic reusable components
├── lib/api.ts                  # API calls to Railway
├── middleware.ts               # Clerk auth middleware
├── .env.local                  # API_URL, Clerk keys
├── tailwind.config.ts
├── next.config.js
└── package.json
```

## MVP Scope

### Included (Phase 1)
- **Dashboard:** Stats cards (seniors count, calls today, upcoming reminders)
- **Seniors:** List, add, edit, delete seniors
- **Senior Detail:** View/edit info, view memories
- **Call Button:** Initiate call to senior (uses existing /api/call)
- **Auth:** Clerk sign-in/sign-up

### Excluded (Future)
- Role-based access (admin vs caregiver)
- Calls history tab
- Reminders management tab
- Caregiver assignment

## UI Design

### Dashboard Page (`/`)
```
┌────────────────────────────────────────────────────┐
│ Donna Admin                       [User Avatar ▼] │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │    5     │ │    12    │ │    3     │          │
│  │ Seniors  │ │ Calls    │ │ Upcoming │          │
│  │          │ │ Today    │ │ Reminders│          │
│  └──────────┘ └──────────┘ └──────────┘          │
│                                                    │
│  Recent Activity                                   │
│  ┌────────────────────────────────────────────┐   │
│  │ Margaret - Called 2 hours ago              │   │
│  │ John - Called 5 hours ago                  │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  [View All Seniors →]                             │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Seniors Page (`/seniors`)
```
┌────────────────────────────────────────────────────┐
│ Seniors                           [+ Add Senior] │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ Margaret Johnson            [Call] [Edit]  │   │
│  │ +1 555 123 4567                            │   │
│  │ Miami, FL • gardening, baking              │   │
│  │ 3 memories                                 │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ John Smith                  [Call] [Edit]  │   │
│  │ +1 555 987 6543                            │   │
│  │ Chicago, IL • chess, history               │   │
│  │ 5 memories                                 │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
└────────────────────────────────────────────────────┘
```

## API Integration

### Client Code (`lib/api.ts`)
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getSeniors() {
  const res = await fetch(`${API_URL}/api/seniors`);
  return res.json();
}

export async function getSenior(id: string) {
  const res = await fetch(`${API_URL}/api/seniors/${id}`);
  return res.json();
}

export async function createSenior(data: SeniorInput) {
  const res = await fetch(`${API_URL}/api/seniors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateSenior(id: string, data: Partial<SeniorInput>) {
  const res = await fetch(`${API_URL}/api/seniors/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${API_URL}/api/stats`);
  return res.json();
}

export async function callSenior(phone: string, pipeline = 'v1') {
  const res = await fetch(`${API_URL}/api/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, pipeline })
  });
  return res.json();
}

export async function getSeniorMemories(id: string) {
  const res = await fetch(`${API_URL}/api/seniors/${id}/memories`);
  return res.json();
}
```

### CORS Configuration
Add to `donna-agent-1/index.js`:
```javascript
import cors from 'cors';
app.use(cors({
  origin: [
    'https://donna-admin.vercel.app',  // Production
    'http://localhost:3000'             // Development
  ]
}));
```

## Environment Variables

### donna-admin/.env.local
```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# API
NEXT_PUBLIC_API_URL=https://donna-api-production-2450.up.railway.app
```

## Implementation Steps

1. **Create Next.js project**
   ```bash
   npx create-next-app@latest donna-admin --typescript --tailwind --app
   ```

2. **Install dependencies**
   ```bash
   npm install @clerk/nextjs
   ```

3. **Set up Clerk**
   - Create Clerk account at clerk.com
   - Create new application
   - Add environment variables

4. **Build pages**
   - Dashboard with stats
   - Seniors list with CRUD
   - Senior detail with memories

5. **Add CORS to Railway API**
   - Install cors package
   - Configure allowed origins

6. **Deploy to Vercel**
   - Connect GitHub repo
   - Add environment variables
   - Deploy

## Notes

- The existing `admin.html` remains in `donna-agent-1/public/` for quick debugging
- No database changes required for MVP
- Role-based access can be added later using Clerk's metadata

## Future Enhancements

- [ ] Role system (admin vs caregiver)
- [ ] Calls history tab
- [ ] Reminders management tab
- [ ] Real-time call status updates
- [ ] Mobile app (React Native)
