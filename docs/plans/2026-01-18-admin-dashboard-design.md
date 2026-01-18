# Admin Dashboard Enhancement Design

## Overview

Enhanced single-page admin dashboard with 4 tabs: Dashboard, Seniors, Calls, Reminders.

## Features

### Dashboard Tab
- Stats cards: Total seniors, Calls today, Upcoming reminders, Active calls
- Recent calls list (last 5)
- Upcoming reminders (next 24 hours)

### Seniors Tab
- Existing functionality preserved
- Add/edit/delete seniors
- Manage memories
- Trigger calls

### Calls Tab
- Call history with pagination
- View transcripts in modal
- Status indicators (completed, missed, failed)

### Reminders Tab
- Create/edit/delete reminders
- Recurring support: Daily, Weekly, One-time
- Types: medication, appointment, custom

## API Endpoints

### New Endpoints
```
GET    /api/reminders        - List all reminders with senior info
POST   /api/reminders        - Create reminder
PATCH  /api/reminders/:id    - Update reminder
DELETE /api/reminders/:id    - Delete reminder
GET    /api/stats            - Dashboard statistics
```

### Existing Endpoints (no changes)
- `/api/seniors/*` - Senior CRUD
- `/api/conversations` - Call history

## File Changes
- `public/admin.html` - Complete rewrite with tabs
- `index.js` - Add 5 new API endpoints (isolated, no pipeline changes)

## Implementation Notes
- No build step required
- Pure HTML/CSS/JS
- Uses existing database schema (reminders table exists)
- No changes to voice pipeline or WebSocket handlers
