# Donna Deployment Guide (Railway)

Deploy Donna to Railway for production use.

## Prerequisites

- Railway account ([railway.app](https://railway.app))
- GitHub account with your Donna repository (`donna2`)

## Quick Deploy

### 1. Deploy Command

**IMPORTANT:** Railway's GitHub webhook is unreliable. Always deploy manually:

```bash
# Full deploy after committing
git add . && git commit -m "your message" && git push && git push origin main:master && railway up

# Or use alias after committing
git pushall && railway up
```

### 2. Initial Setup (First Time Only)

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `donna2` repository
4. Railway auto-detects Node.js

### 3. Add Environment Variables

In Railway dashboard → Variables:

| Variable | Source | Required |
|----------|--------|----------|
| `PORT` | Railway sets automatically | Auto |
| `DATABASE_URL` | [neon.tech](https://neon.tech) | ✅ |
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) | ✅ |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) | ✅ |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | ✅ |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | ✅ |
| `GOOGLE_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | ✅ |
| `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io) | ✅ |
| `DEEPGRAM_API_KEY` | [deepgram.com](https://deepgram.com) | ✅ |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | ✅ |

**Optional:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `FAST_OBSERVER_MODEL` | `gemini-3-flash-preview` | Conversation Director model |
| `CALL_ANALYSIS_MODEL` | `gemini-3-flash-preview` | Post-call analysis model |

### 4. Get Your Public URL

Railway provides a URL like: `https://donna-production.up.railway.app`

This URL is stored in `RAILWAY_PUBLIC_DOMAIN` environment variable.

### 5. Configure Twilio Webhooks

1. Go to [Twilio Console](https://console.twilio.com) → Phone Numbers
2. Select your number
3. Under "Voice & Fax":
   - **A Call Comes In:** `https://YOUR-APP.up.railway.app/voice/answer`
   - **Method:** `POST`
   - **Status Callback:** `https://YOUR-APP.up.railway.app/voice/status`
   - **Method:** `POST`

## Verify Deployment

```bash
curl https://YOUR-APP.up.railway.app/health
```

Expected response:
```json
{"status": "ok", "timestamp": "2026-01-21T..."}
```

## Deploy Workflow

After making changes:

```bash
# 1. Test locally
npm run dev

# 2. Commit changes
git add .
git commit -m "feat: your change description"

# 3. Push and deploy
git push && git push origin main:master && railway up
```

## Troubleshooting

### View Logs

Railway dashboard → Deployments → View Logs

Or use CLI:
```bash
railway logs
```

### Common Issues

**Build fails:**
- Check `package.json` has correct start script (`node index.js`)
- Ensure Node.js version ≥20 in `package.json`

**Twilio not connecting:**
- Verify webhook URL is HTTPS (Railway provides this)
- Check Railway logs for incoming requests
- Ensure phone number is configured in Twilio Console

**WebSocket connection issues:**
- Railway supports WebSockets by default
- Check for `wss://` URL construction in logs

**Environment variables not working:**
- Variables are case-sensitive
- Run `railway up` after adding new variables
- Verify in Railway dashboard → Variables

**Database connection issues:**
- Neon connection strings include `?sslmode=require`
- Check `DATABASE_URL` format

## Cost

Railway offers:
- **Hobby plan:** $5/month
- **Pro plan:** Usage-based

Typical monthly costs for development:
- Railway: ~$5-15
- Neon (free tier): $0
- External APIs: Variable

See [railway.app/pricing](https://railway.app/pricing)

---

*Last updated: January 2026*
