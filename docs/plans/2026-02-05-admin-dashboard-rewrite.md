# Admin Dashboard Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken admin dashboard by adding proper authentication, new data sections (call analyses, caregivers, daily context), and admin user management.

**Architecture:** Add an `admin_users` DB table with bcrypt-hashed passwords. Login returns a JWT stored in localStorage. The existing `requireAuth` middleware gains a 3rd auth path (JWT Bearer tokens). The static `admin.html` gets a login form overlay and 3 new tabs for the new data model.

**Tech Stack:** Express.js, Drizzle ORM, bcrypt, jsonwebtoken, static HTML/CSS/JS (no React)

---

### Task 1: Add admin_users table and dependencies

**Files:**
- Modify: `db/schema.js` (add adminUsers table after dailyCallContext)
- Modify: `package.json` (add bcrypt, jsonwebtoken)

**Step 1: Add adminUsers schema to db/schema.js**

Add after the `dailyCallContext` table definition:

```javascript
// Admin users for dashboard authentication
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
});
```

**Step 2: Install dependencies**

Run: `npm install bcrypt jsonwebtoken`

**Step 3: Push schema to DB**

Run: `npx drizzle-kit push`

If drizzle-kit is not available, create the table manually:

```sql
CREATE TABLE admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);
```

**Step 4: Create seed script for initial admin user**

Create file: `scripts/create-admin.js`

```javascript
import 'dotenv/config';
import { db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import bcrypt from 'bcrypt';

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> [name]');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

const [admin] = await db.insert(adminUsers).values({
  email,
  passwordHash,
  name,
}).returning();

console.log(`Admin created: ${admin.email} (${admin.id})`);
process.exit(0);
```

**Step 5: Commit**

```bash
git add db/schema.js package.json package-lock.json scripts/create-admin.js
git commit -m "feat: add admin_users table and seed script"
```

---

### Task 2: Add admin auth routes (login + me)

**Files:**
- Create: `routes/admin-auth.js`
- Modify: `routes/index.js` (register new route)

**Step 1: Create routes/admin-auth.js**

```javascript
import { Router } from 'express';
import { db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'donna-admin-secret-change-me';

// Login - no auth required
router.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [admin] = await db.select().from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase().trim()));

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await db.update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });
  } catch (error) {
    console.error('[Admin Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current admin - requires valid JWT
router.get('/api/admin/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const [admin] = await db.select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      lastLoginAt: adminUsers.lastLoginAt,
    }).from(adminUsers)
      .where(eq(adminUsers.id, decoded.adminId));

    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }

    res.json(admin);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Auth check failed' });
  }
});

export default router;
```

**Step 2: Register route in routes/index.js**

Add import and mount alongside existing routes:

```javascript
import adminAuthRoutes from './admin-auth.js';
// In mountRoutes function:
app.use(adminAuthRoutes);
```

**Step 3: Commit**

```bash
git add routes/admin-auth.js routes/index.js
git commit -m "feat: add admin login and me endpoints"
```

---

### Task 3: Update requireAuth middleware to accept JWT Bearer tokens

**Files:**
- Modify: `middleware/auth.js` (add JWT check as 3rd auth path)

**Step 1: Update requireAuth in middleware/auth.js**

Add JWT verification between the cofounder check and the Clerk check:

```javascript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'donna-admin-secret-change-me';

export async function requireAuth(req, res, next) {
  // 1. Check for cofounder API key (can't be locked out)
  if (isCofounderRequest(req)) {
    req.auth = { isCofounder: true, isAdmin: true, userId: 'cofounder' };
    return next();
  }

  // 2. Check for admin JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.auth = {
        isCofounder: false,
        isAdmin: true,
        userId: decoded.adminId,
      };
      return next();
    } catch {
      // Invalid JWT - fall through to Clerk
    }
  }

  // 3. Check Clerk session (existing code unchanged)
  try {
    const auth = getAuth(req);
    // ... rest of existing Clerk logic
  }
}
```

Also update `requireAdmin` and `optionalAuth` the same way if needed. The key change is only in `requireAuth` since `requireAdmin` calls it.

**Step 2: Commit**

```bash
git add middleware/auth.js
git commit -m "feat: add JWT Bearer token auth to requireAuth middleware"
```

---

### Task 4: Add call analyses API route

**Files:**
- Create: `routes/call-analyses.js`
- Modify: `routes/index.js` (register)

**Step 1: Create routes/call-analyses.js**

```javascript
import { Router } from 'express';
import { db } from '../db/client.js';
import { callAnalyses, seniors } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// List all call analyses with senior names
router.get('/api/call-analyses', requireAdmin, async (req, res) => {
  try {
    const analyses = await db.select({
      id: callAnalyses.id,
      conversationId: callAnalyses.conversationId,
      seniorId: callAnalyses.seniorId,
      seniorName: seniors.name,
      summary: callAnalyses.summary,
      topics: callAnalyses.topics,
      engagementScore: callAnalyses.engagementScore,
      concerns: callAnalyses.concerns,
      positiveObservations: callAnalyses.positiveObservations,
      followUpSuggestions: callAnalyses.followUpSuggestions,
      callQuality: callAnalyses.callQuality,
      createdAt: callAnalyses.createdAt,
    })
    .from(callAnalyses)
    .leftJoin(seniors, eq(callAnalyses.seniorId, seniors.id))
    .orderBy(desc(callAnalyses.createdAt))
    .limit(100);

    res.json(analyses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

**Step 2: Register in routes/index.js**

```javascript
import callAnalysesRoutes from './call-analyses.js';
app.use(callAnalysesRoutes);
```

**Step 3: Commit**

```bash
git add routes/call-analyses.js routes/index.js
git commit -m "feat: add call analyses API endpoint"
```

---

### Task 5: Add daily context API route

**Files:**
- Create: `routes/daily-context.js`
- Modify: `routes/index.js` (register)

**Step 1: Create routes/daily-context.js**

```javascript
import { Router } from 'express';
import { db } from '../db/client.js';
import { dailyCallContext, seniors } from '../db/schema.js';
import { eq, and, gte, lt, desc } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Get daily context entries, optionally filtered by senior and date
router.get('/api/daily-context', requireAdmin, async (req, res) => {
  try {
    const { seniorId, date } = req.query;

    let query = db.select({
      id: dailyCallContext.id,
      seniorId: dailyCallContext.seniorId,
      seniorName: seniors.name,
      callDate: dailyCallContext.callDate,
      callSid: dailyCallContext.callSid,
      topicsDiscussed: dailyCallContext.topicsDiscussed,
      remindersDelivered: dailyCallContext.remindersDelivered,
      adviceGiven: dailyCallContext.adviceGiven,
      keyMoments: dailyCallContext.keyMoments,
      summary: dailyCallContext.summary,
      createdAt: dailyCallContext.createdAt,
    })
    .from(dailyCallContext)
    .leftJoin(seniors, eq(dailyCallContext.seniorId, seniors.id))
    .orderBy(desc(dailyCallContext.callDate))
    .limit(50);

    // Apply filters if provided
    const conditions = [];
    if (seniorId) {
      conditions.push(eq(dailyCallContext.seniorId, seniorId));
    }
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      conditions.push(gte(dailyCallContext.callDate, start));
      conditions.push(lt(dailyCallContext.callDate, end));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query;
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

**Step 2: Register in routes/index.js**

```javascript
import dailyContextRoutes from './daily-context.js';
app.use(dailyContextRoutes);
```

**Step 3: Commit**

```bash
git add routes/daily-context.js routes/index.js
git commit -m "feat: add daily context API endpoint"
```

---

### Task 6: Update admin.html — Add login form + auth to all fetches

**Files:**
- Modify: `public/admin.html`

**Step 1: Add login overlay HTML**

Add before the `.container` div:

```html
<!-- Login Overlay -->
<div id="loginOverlay" style="position:fixed;inset:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;z-index:200;">
  <div style="background:white;border-radius:16px;padding:40px;width:90%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <h1 style="text-align:center;margin-bottom:8px;color:#333;">Donna Admin</h1>
    <p style="text-align:center;color:#888;margin-bottom:24px;font-size:14px;">Sign in to manage your seniors</p>
    <form id="loginForm">
      <div class="form-group">
        <label for="loginEmail">Email</label>
        <input type="email" id="loginEmail" required placeholder="admin@donna.com">
      </div>
      <div class="form-group">
        <label for="loginPassword">Password</label>
        <input type="password" id="loginPassword" required placeholder="Your password">
      </div>
      <p id="loginError" style="color:#e74c3c;font-size:13px;margin-bottom:12px;display:none;"></p>
      <button type="submit" style="width:100%;">Sign In</button>
    </form>
  </div>
</div>
```

**Step 2: Add auth JavaScript**

Replace the `const API = window.location.origin;` section with:

```javascript
const API = window.location.origin;
let authToken = localStorage.getItem('donna_admin_token');

// Authenticated fetch wrapper
async function authFetch(url, options = {}) {
  const headers = { ...options.headers };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    authToken = null;
    localStorage.removeItem('donna_admin_token');
    showLogin();
    throw new Error('Unauthorized');
  }
  return res;
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.style.display = 'block';
      return;
    }
    authToken = data.token;
    localStorage.setItem('donna_admin_token', data.token);
    hideLogin();
    loadAll();
  } catch (err) {
    errorEl.textContent = 'Connection error';
    errorEl.style.display = 'block';
  }
});

function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

function hideLogin() {
  document.getElementById('loginOverlay').style.display = 'none';
}

// Check auth on load
async function checkAuth() {
  if (!authToken) { showLogin(); return; }
  try {
    const res = await fetch(`${API}/api/admin/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    if (!res.ok) { showLogin(); return; }
    hideLogin();
    loadAll();
  } catch {
    showLogin();
  }
}
```

**Step 3: Replace all `fetch(` calls with `authFetch(`**

Replace every instance of `fetch(\`${API}/api/...` with `authFetch(\`${API}/api/...` throughout the file. The login endpoint (`/api/admin/login`) and me endpoint (`/api/admin/me`) use raw `fetch` since they handle auth themselves.

**Step 4: Add loadAll function and update initial load**

Replace the bottom section:

```javascript
function loadAll() {
  loadDashboard();
  loadSeniors();
  loadCalls();
  loadReminders();
  loadCallAnalyses();
  loadDailyContext();
}

// Initial auth check (replaces direct loadX calls)
checkAuth();

// Refresh dashboard every 30 seconds (only if logged in)
setInterval(() => { if (authToken) loadDashboard(); }, 30000);
```

**Step 5: Add logout button to header**

```html
<header>
  <div>
    <h1>Donna Admin</h1>
    <p>Manage seniors, calls, and reminders</p>
  </div>
  <div style="display:flex;align-items:center;gap:12px;">
    <div class="version-badge">v3.3</div>
    <button class="small secondary" onclick="logout()" style="background:#ffffff33;color:white;">Logout</button>
  </div>
</header>
```

```javascript
function logout() {
  authToken = null;
  localStorage.removeItem('donna_admin_token');
  showLogin();
}
```

**Step 6: Commit**

```bash
git add public/admin.html
git commit -m "feat: add login form and auth to admin dashboard"
```

---

### Task 7: Update admin.html — Add new tabs (Call Analyses, Caregivers, Daily Context)

**Files:**
- Modify: `public/admin.html`

**Step 1: Add new tab buttons**

Add to the `.tabs` div:

```html
<button class="tab" data-tab="analyses">Call Analyses</button>
<button class="tab" data-tab="caregivers">Caregivers</button>
<button class="tab" data-tab="dailyContext">Daily Context</button>
```

**Step 2: Add Call Analyses tab HTML**

```html
<!-- Call Analyses Tab -->
<div id="analyses" class="tab-content">
  <div class="card">
    <h2>Post-Call Analyses</h2>
    <div id="analysesList"></div>
  </div>
</div>
```

**Step 3: Add Caregivers tab HTML**

```html
<!-- Caregivers Tab -->
<div id="caregivers" class="tab-content">
  <div class="card">
    <h2>Caregiver-Senior Links</h2>
    <div id="caregiversList"></div>
  </div>
</div>
```

**Step 4: Add Daily Context tab HTML**

```html
<!-- Daily Context Tab -->
<div id="dailyContext" class="tab-content">
  <div class="card">
    <h2>Daily Call Context</h2>
    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <select id="contextSenior" style="flex:1;">
        <option value="">All seniors</option>
      </select>
      <input type="date" id="contextDate" style="width:160px;">
      <button class="small" onclick="loadDailyContext()">Filter</button>
    </div>
    <div id="dailyContextList"></div>
  </div>
</div>
```

**Step 5: Add JavaScript for Call Analyses**

```javascript
async function loadCallAnalyses() {
  try {
    const res = await authFetch(`${API}/api/call-analyses`);
    const analyses = await res.json();
    if (!analyses.length) {
      document.getElementById('analysesList').innerHTML = '<p class="empty-state">No call analyses yet</p>';
      return;
    }
    document.getElementById('analysesList').innerHTML = analyses.map(a => `
      <div class="list-item" style="flex-direction:column;">
        <div style="display:flex;justify-content:space-between;width:100%;margin-bottom:8px;">
          <div>
            <h3>${esc(a.seniorName || 'Unknown')}</h3>
            <p class="meta">${formatDate(a.createdAt)}</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:24px;font-weight:700;color:${a.engagementScore >= 7 ? '#27ae60' : a.engagementScore >= 4 ? '#f39c12' : '#e74c3c'};">
              ${a.engagementScore || '-'}/10
            </div>
            <p class="meta">Engagement</p>
          </div>
        </div>
        <p style="font-size:13px;color:#555;">${esc(a.summary || 'No summary')}</p>
        ${a.topics?.length ? `<div style="margin-top:8px;">${a.topics.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${a.concerns?.length ? `<div style="margin-top:8px;"><strong style="font-size:12px;color:#e74c3c;">Concerns:</strong> <span style="font-size:12px;">${Array.isArray(a.concerns) ? a.concerns.map(c => esc(typeof c === 'string' ? c : c.description || JSON.stringify(c))).join(', ') : ''}</span></div>` : ''}
        ${a.positiveObservations?.length ? `<div style="margin-top:4px;"><strong style="font-size:12px;color:#27ae60;">Positive:</strong> <span style="font-size:12px;">${a.positiveObservations.map(p => esc(p)).join(', ')}</span></div>` : ''}
        ${a.followUpSuggestions?.length ? `<div style="margin-top:4px;"><strong style="font-size:12px;color:#667eea;">Follow-up:</strong> <span style="font-size:12px;">${a.followUpSuggestions.map(f => esc(f)).join(', ')}</span></div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    if (e.message !== 'Unauthorized') console.error('Failed to load analyses', e);
  }
}
```

**Step 6: Add JavaScript for Caregivers**

```javascript
async function loadCaregivers() {
  try {
    const res = await authFetch(`${API}/api/caregivers`);
    const links = await res.json();
    if (!links.length) {
      document.getElementById('caregiversList').innerHTML = '<p class="empty-state">No caregiver links yet</p>';
      return;
    }
    document.getElementById('caregiversList').innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid #eee;">
            <th style="text-align:left;padding:8px;">Clerk User ID</th>
            <th style="text-align:left;padding:8px;">Senior</th>
            <th style="text-align:left;padding:8px;">Role</th>
            <th style="text-align:left;padding:8px;">Added</th>
          </tr>
        </thead>
        <tbody>
          ${links.map(l => `
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:8px;font-family:monospace;font-size:11px;">${esc(l.clerkUserId)}</td>
              <td style="padding:8px;">${esc(l.seniorName || l.seniorId)}</td>
              <td style="padding:8px;"><span class="tag">${esc(l.role)}</span></td>
              <td style="padding:8px;color:#888;">${formatDate(l.createdAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    if (e.message !== 'Unauthorized') console.error('Failed to load caregivers', e);
  }
}
```

**Step 7: Add JavaScript for Daily Context**

```javascript
async function loadDailyContext() {
  try {
    const seniorId = document.getElementById('contextSenior')?.value || '';
    const date = document.getElementById('contextDate')?.value || '';
    let url = `${API}/api/daily-context`;
    const params = [];
    if (seniorId) params.push(`seniorId=${seniorId}`);
    if (date) params.push(`date=${date}`);
    if (params.length) url += '?' + params.join('&');

    const res = await authFetch(url);
    const contexts = await res.json();

    if (!contexts.length) {
      document.getElementById('dailyContextList').innerHTML = '<p class="empty-state">No daily context entries</p>';
      return;
    }

    document.getElementById('dailyContextList').innerHTML = contexts.map(c => `
      <div class="list-item" style="flex-direction:column;">
        <div style="display:flex;justify-content:space-between;width:100%;margin-bottom:8px;">
          <h3>${esc(c.seniorName || 'Unknown')}</h3>
          <span class="meta">${c.callDate ? new Date(c.callDate).toLocaleDateString() : '-'}</span>
        </div>
        ${c.summary ? `<p style="font-size:13px;color:#555;margin-bottom:8px;">${esc(c.summary)}</p>` : ''}
        ${c.topicsDiscussed?.length ? `<div style="margin-bottom:4px;"><strong style="font-size:12px;">Topics:</strong> ${c.topicsDiscussed.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${c.remindersDelivered?.length ? `<div style="margin-bottom:4px;"><strong style="font-size:12px;">Reminders:</strong> ${c.remindersDelivered.map(r => `<span class="tag" style="background:#d4edda;color:#155724;">${esc(r)}</span>`).join('')}</div>` : ''}
        ${c.adviceGiven?.length ? `<div style="margin-bottom:4px;"><strong style="font-size:12px;">Advice:</strong> <span style="font-size:12px;">${c.adviceGiven.map(a => esc(a)).join('; ')}</span></div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    if (e.message !== 'Unauthorized') console.error('Failed to load daily context', e);
  }
}
```

**Step 8: Update loadAll to include new tabs**

Make sure `loadAll()` calls the new functions:

```javascript
function loadAll() {
  loadDashboard();
  loadSeniors();
  loadCalls();
  loadReminders();
  loadCallAnalyses();
  loadCaregivers();
  loadDailyContext();
}
```

**Step 9: Populate contextSenior dropdown**

In the existing `populateSeniorDropdown` function, also populate the context senior dropdown:

```javascript
function populateSeniorDropdown(seniors) {
  const sel = document.getElementById('reminderSenior');
  sel.innerHTML = '<option value="">Select senior...</option>' +
    seniors.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  // Also populate daily context filter
  const ctxSel = document.getElementById('contextSenior');
  if (ctxSel) {
    ctxSel.innerHTML = '<option value="">All seniors</option>' +
      seniors.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
}
```

**Step 10: Commit**

```bash
git add public/admin.html
git commit -m "feat: add call analyses, caregivers, and daily context tabs to admin"
```

---

### Task 8: Add caregivers list API endpoint (if missing)

**Files:**
- Check: `routes/caregivers.js` (may need a list endpoint with senior names)

**Step 1: Check if GET /api/caregivers exists**

Read `routes/caregivers.js` and check if there's a list endpoint that returns caregiver-senior links with senior names.

**Step 2: Add or update list endpoint**

If missing, add:

```javascript
router.get('/api/caregivers', requireAdmin, async (req, res) => {
  try {
    const links = await db.select({
      id: caregivers.id,
      clerkUserId: caregivers.clerkUserId,
      seniorId: caregivers.seniorId,
      seniorName: seniors.name,
      role: caregivers.role,
      createdAt: caregivers.createdAt,
    })
    .from(caregivers)
    .leftJoin(seniors, eq(caregivers.seniorId, seniors.id))
    .orderBy(desc(caregivers.createdAt));

    res.json(links);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Commit**

```bash
git add routes/caregivers.js
git commit -m "feat: add caregivers list endpoint for admin"
```

---

### Task 9: Update docs and deploy

**Files:**
- Modify: `CLAUDE.md` (update key files, working features)
- Modify: `docs/architecture/OVERVIEW.md` (add admin_users table, new routes)

**Step 1: Update CLAUDE.md**

- Add `admin_users` to DB schema section
- Add `routes/admin-auth.js`, `routes/call-analyses.js`, `routes/daily-context.js` to key files
- Add `JWT_SECRET` to environment variables
- Mark admin auth as implemented in roadmap

**Step 2: Create initial admin user**

Run on production:
```bash
railway run node scripts/create-admin.js your@email.com your-password "Your Name"
```

**Step 3: Set JWT_SECRET in Railway**

```bash
railway variables set JWT_SECRET=$(openssl rand -hex 32)
```

**Step 4: Deploy**

```bash
git push && git push origin main:master && railway up
```

**Step 5: Verify**

- Visit `https://donna-api-production-2450.up.railway.app/admin.html`
- Login form should appear
- After login, all tabs should load data
- Check Call Analyses, Caregivers, Daily Context tabs

---

## Task Dependencies

```
Task 1 (DB + deps) ──┬──→ Task 2 (auth routes) ──→ Task 3 (middleware update)
                      │                                      │
                      │                                      ▼
                      ├──→ Task 4 (analyses route) ──→ Task 6 (admin.html auth)
                      │                                      │
                      ├──→ Task 5 (daily context route)      ▼
                      │                              Task 7 (admin.html tabs)
                      └──→ Task 8 (caregivers route)         │
                                                             ▼
                                                     Task 9 (docs + deploy)
```

**Parallelizable:** Tasks 2, 4, 5, 8 can run in parallel after Task 1.
**Sequential:** Task 3 depends on Task 2. Tasks 6-7 depend on Tasks 3-5. Task 9 is last.
