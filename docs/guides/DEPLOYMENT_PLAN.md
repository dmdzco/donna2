# Donna Test UI Deployment Plan

This guide explains how to deploy the Donna test UIs online so anyone can access them without running locally.

## 📋 What We're Deploying

**3 Browser Test UIs:**
- Phase 1: Voice Communication Infrastructure (`test-phase1.html`)
- Phase 2: Business Modules (`test-phase2.html`)
- Phase 3: AI Enhancement (`test-phase3.html`)

**Backend API:**
- Express.js server with test routes
- All 12 modules fully operational

---

## 🚀 Deployment Options

### Option 1: Vercel (Recommended - Easiest)

**Best for:** Quick deployment, automatic HTTPS, free tier

####Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

#### Step 2: Create `vercel.json` Configuration
Create `/vercel.json` in your project root:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/api/src/index.ts",
      "use": "@vercel/node"
    },
    {
      "src": "apps/api/public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/test/(.*)",
      "dest": "/apps/api/public/$1"
    },
    {
      "src": "/api/(.*)",
      "dest": "/apps/api/src/index.ts"
    },
    {
      "src": "/(.*)",
      "dest": "/apps/api/src/index.ts"
    }
  ],
  "env": {
    "DATABASE_URL": "@database-url",
    "ANTHROPIC_API_KEY": "@anthropic-api-key",
    "DEEPGRAM_API_KEY": "@deepgram-api-key",
    "ELEVENLABS_API_KEY": "@elevenlabs-api-key",
    "TWILIO_ACCOUNT_SID": "@twilio-account-sid",
    "TWILIO_AUTH_TOKEN": "@twilio-auth-token",
    "TWILIO_PHONE_NUMBER": "@twilio-phone-number",
    "BLOB_READ_WRITE_TOKEN": "@blob-read-write-token",
    "UPSTASH_REDIS_REST_URL": "@upstash-redis-rest-url",
    "UPSTASH_REDIS_REST_TOKEN": "@upstash-redis-rest-token",
    "JWT_SECRET": "@jwt-secret",
    "API_URL": "@api-url"
  }
}
```

#### Step 3: Deploy
```bash
cd /Users/davidzuluaga/code/donna
vercel
```

#### Step 4: Add Environment Variables
In Vercel dashboard:
1. Go to Project Settings > Environment Variables
2. Add all required variables from `.env`

#### Step 5: Access Your Test UIs
- Phase 1: `https://your-project.vercel.app/test/test-phase1.html`
- Phase 2: `https://your-project.vercel.app/test/test-phase2.html`
- Phase 3: `https://your-project.vercel.app/test/test-phase3.html`

---

### Option 2: Netlify

**Best for:** Static site hosting with serverless functions

#### Step 1: Install Netlify CLI
```bash
npm install -g netlify-cli
```

#### Step 2: Create `netlify.toml`
```toml
[build]
  command = "npm run build"
  functions = "apps/api/src"
  publish = "apps/api/public"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/test/*"
  to = "/:splat"
  status = 200
```

#### Step 3: Convert Express Routes to Serverless Functions
Create `/apps/api/src/functions/test-phase1.ts`:
```typescript
import type { Handler } from '@netlify/functions';
import testPhase1Router from '../routes/test-phase1';

export const handler: Handler = async (event, context) => {
  // Convert Express router to serverless function
  // ... implementation
};
```

#### Step 4: Deploy
```bash
netlify deploy --prod
```

---

### Option 3: Railway.app

**Best for:** Full Node.js apps with databases

#### Step 1: Create `railway.json`
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### Step 2: Deploy via GitHub
1. Push code to GitHub
2. Go to railway.app
3. Click "New Project" > "Deploy from GitHub"
4. Select your repository
5. Add environment variables
6. Deploy!

#### Step 3: Access
- `https://your-project.railway.app/test/test-phase1.html`

---

### Option 4: Render.com

**Best for:** Free tier with persistent storage

#### Step 1: Create `render.yaml`
```yaml
services:
  - type: web
    name: donna-api
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      # ... add all env vars

  - type: static
    name: donna-test-ui
    buildCommand: echo "No build needed"
    staticPublishPath: apps/api/public
    routes:
      - type: rewrite
        source: /test/*
        destination: /*
```

#### Step 2: Deploy
1. Connect GitHub repository
2. Select `render.yaml`
3. Add environment variables
4. Deploy

---

## 🔒 Security Considerations

### Production Deployment

**⚠️ IMPORTANT:** The test UIs expose internal module testing. For production:

1. **Add Authentication:**
```typescript
// In index.ts
import basicAuth from 'express-basic-auth';

app.use('/api/test', basicAuth({
  users: { 'admin': process.env.TEST_UI_PASSWORD || 'changeme' },
  challenge: true,
  realm: 'Donna Test UI'
}));
```

2. **Restrict by IP (Optional):**
```typescript
import ipfilter from 'express-ipfilter';

app.use('/api/test', ipfilter.IpFilter(['192.168.1.1'], { mode: 'allow' }));
```

3. **Use Environment-Based Access:**
```typescript
if (process.env.NODE_ENV === 'production') {
  app.use('/test', (req, res) => {
    res.status(403).send('Test UI disabled in production');
  });
}
```

---

## 📱 Mobile-Friendly Access

All test UIs are responsive and work on:
- Desktop browsers
- Tablets
- Mobile phones

Test on your phone: Just visit the deployed URL!

---

## 🔗 Recommended: Vercel Deployment (Step-by-Step)

### Full Deployment Instructions

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Create `vercel.json`:** (See Option 1 above)

4. **Deploy:**
   ```bash
   vercel
   ```

5. **Follow Prompts:**
   ```
   ? Set up and deploy "~/code/donna"? [Y/n] y
   ? Which scope do you want to deploy to? your-username
   ? Link to existing project? [y/N] n
   ? What's your project's name? donna
   ? In which directory is your code located? ./
   ```

6. **Add Environment Variables:**
   ```bash
   vercel env add DATABASE_URL
   # Paste your Neon database URL

   vercel env add ANTHROPIC_API_KEY
   # Paste your Anthropic API key

   # ... repeat for all env vars
   ```

7. **Deploy Again (with env vars):**
   ```bash
   vercel --prod
   ```

8. **Share Your Test UIs:**
   ```
   Phase 1: https://donna.vercel.app/test/test-phase1.html
   Phase 2: https://donna.vercel.app/test/test-phase2.html
   Phase 3: https://donna.vercel.app/test/test-phase3.html
   ```

---

## 🎯 Quick Test After Deployment

Visit each test UI and click "Refresh Status" button:
- ✅ All modules should show "Ready"
- ✅ Green indicators
- ✅ No errors in browser console

---

## 🐛 Troubleshooting

### Issue: "Module not found" errors
**Solution:** Ensure `package.json` has all dependencies:
```bash
npm install
vercel --prod
```

### Issue: API routes return 404
**Solution:** Check `vercel.json` routes configuration matches your file structure

### Issue: Environment variables not working
**Solution:**
```bash
vercel env ls
vercel env pull
```

### Issue: CORS errors
**Solution:** Update CORS in `index.ts`:
```typescript
app.use(cors({
  origin: process.env.WEB_URL || '*', // Allow all in test mode
  credentials: true,
}));
```

---

## 📊 Cost Estimate

| Platform | Free Tier | Paid Tier |
|----------|-----------|-----------|
| **Vercel** | 100GB bandwidth/month | $20/month |
| **Netlify** | 100GB bandwidth/month | $19/month |
| **Railway** | $5 free credit/month | Usage-based |
| **Render** | 750 hours/month | $7/month |

**Recommendation:** Start with Vercel free tier

---

## ✅ Deployment Checklist

- [ ] Choose deployment platform
- [ ] Create platform-specific config file
- [ ] Add all environment variables
- [ ] Deploy to staging first
- [ ] Test all 3 test UIs
- [ ] Verify API endpoints work
- [ ] Check module status shows all green
- [ ] Add authentication (production)
- [ ] Share public URL
- [ ] Monitor usage/errors

---

## 🔄 Continuous Deployment

### GitHub Actions (Auto-deploy on push)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Vercel

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install Vercel CLI
        run: npm install -g vercel
      - name: Deploy to Vercel
        run: vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## 📞 Support

If you encounter issues:
1. Check deployment platform logs
2. Verify environment variables
3. Test locally first: `npm run dev`
4. Check browser console for errors

---

## 🎉 Success!

Once deployed, anyone can:
- Test Phase 1 voice modules
- Test Phase 2 business logic
- Test Phase 3 AI features
- No local setup required!

**Example Public URL:** `https://donna-test.vercel.app/test/test-phase1.html`
