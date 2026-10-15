# Quick Start: Deploy to Render (5 minutes)

## What This Does
Your agent swarm will run 24/7 on Render's free tier, automatically developing your Proximity app while you sleep.

## Prerequisites
- GitHub account (free)
- Render account (free at render.com)
- Your API keys (Groq, Telegram, Supabase)

## Step-by-Step

### 1. Prepare Your Repo
```bash
cd /Users/owner/Documents/projects/Agents/agentkiro
git add .
git commit -m "Add Render deployment files"
git push origin main
```

### 2. Create Render Account
Visit https://render.com and sign up (free).

### 3. Deploy Service
1. Go to Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repo (agentkiro)
4. Fill in:
   - **Name:** agent-swarm
   - **Environment:** Node
   - **Build Command:** `npm install && bash build.sh`
   - **Start Command:** `node swarm/agent-coordinator.js`
   - **Plan:** Free (select this!)

### 4. Add Environment Variables
In Render, go to "Environment" and add these variables from your local `.env` file:

```
GROQ_API_KEY=<your key here>
GROQ_API_KEY_2=<your key here>
GROQ_API_KEY_3=<your key here>
GEMINI_API_KEY=<your key here>
TELEGRAM_BOT_TOKEN=<your token here>
SUPABASE_URL=<your url here>
SUPABASE_KEY=<your key here>
SUPABASE_ADMIN_KEY=<your admin key here>
GIT_USER_NAME=owner
GIT_USER_EMAIL=owner@localhost
PROJECT_PATH=/opt/render/project/proximity-app-final
```

**Important:** Never commit real API keys to GitHub. Copy the actual values from your local `.env` file and paste them into Render's environment variables form manually.

### 5. Deploy!
Click "Create Web Service"

**Wait 2-3 minutes for deployment...**

### 6. Keep It Running Forever (UptimeRobot)
1. Go to https://uptimerobot.com (free)
2. Sign up
3. Click "Add Monitor"
4. **HTTP(s):** Choose this option
5. **URL:** `https://YOUR_RENDER_APP_URL/health`
   - (Copy your Render app URL from dashboard)
6. **Monitoring Interval:** 5 minutes
7. Click "Create Monitor"

## Done! 🎉

Your agent will now:
- ✅ Run continuously on Render (free tier)
- ✅ Auto-wake via UptimeRobot pings
- ✅ Execute tasks 24/7
- ✅ Save code to your Proximity app
- ✅ Cost: $0

## Check Progress
- **Logs:** Render Dashboard → Your app → Logs
- **Memory:** Check `swarm/memory/session.json`
- **Code:** Check your Proximity app repo

## Troubleshooting
- **App sleeping?** Add UptimeRobot (step 6)
- **Not developing?** Check Render logs for errors
- **API errors?** Verify all env vars are correct

Need help? Check `DEPLOYMENT.md`
