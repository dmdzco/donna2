# Donna Deployment Guide (Railway)

Deploy Donna to Railway for production use.

## Prerequisites

- Railway account ([railway.app](https://railway.app))
- GitHub account with your Donna repository

## Quick Deploy

### 1. Push to GitHub

```bash
git push origin main
```

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `donna2` repository
4. Railway auto-detects Node.js and deploys

### 3. Add Environment Variables

In Railway dashboard → Variables:

| Variable | Where to Get It |
|----------|-----------------|
| `PORT` | Railway sets automatically |
| `GOOGLE_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number |
| `DATABASE_URL` | [neon.tech](https://neon.tech) (Milestone 7+) |

### 4. Get Your Public URL

Railway provides a URL like: `https://donna-production.up.railway.app`

### 5. Configure Twilio Webhooks

1. Go to [Twilio Console](https://console.twilio.com) → Phone Numbers
2. Select your number
3. Set webhook: `https://YOUR-APP.up.railway.app/voice/answer`
4. Method: `POST`

## Verify Deployment

```bash
curl https://YOUR-APP.up.railway.app/health
```

Expected response:
```json
{"status": "ok", "milestone": 1}
```

## Redeploy After Changes

Railway auto-deploys when you push to GitHub:

```bash
git add -A
git commit -m "Update feature"
git push origin main
```

## Troubleshooting

### View Logs

Railway dashboard → Deployments → View Logs

### Common Issues

**Build fails:**
- Check `package.json` has correct start script
- Ensure Node.js version ≥20

**Twilio not connecting:**
- Verify webhook URL is correct
- Check Railway logs for incoming requests

**Environment variables not working:**
- Variables are case-sensitive
- Redeploy after adding new variables

## Cost

Railway offers:
- **Free tier:** $5/month credit (enough for development)
- **Pro:** Usage-based pricing

See [railway.app/pricing](https://railway.app/pricing)
