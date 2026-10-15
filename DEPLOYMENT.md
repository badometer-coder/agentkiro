# Deploy Agent Swarm to Render.com (FREE)

## Step 1: Push to GitHub
```bash
cd /Users/owner/Documents/projects/Agents/agentkiro
git add .
git commit -m "Add deployment configuration"
git push origin main
```

## Step 2: Create Render Account
1. Go to https://render.com
2. Sign up (free)
3. Connect your GitHub account

## Step 3: Deploy
1. Click "New +" → "Web Service"
2. Select your GitHub repo
3. Use this configuration:
   - **Name:** agent-swarm
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `cd swarm && node agent-coordinator.js`
   - **Plan:** Free

## Step 4: Add Environment Variables
In Render dashboard, add these from your `.env`:
- GROQ_API_KEY
- GROQ_API_KEY_2
- GROQ_API_KEY_3
- GEMINI_API_KEY (if you have it)
- TELEGRAM_BOT_TOKEN
- SUPABASE_URL
- SUPABASE_KEY
- SUPABASE_ADMIN_KEY
- PROJECT_PATH (set to: /opt/render/project/proximity-app-final)
- GIT_USER_NAME
- GIT_USER_EMAIL

## Step 5: Keep It Running (UptimeRobot)
1. Go to https://uptimerobot.com (free)
2. Create account
3. Add monitor:
   - URL: Your Render app URL + /health
   - Interval: 5 minutes
4. This pings your service every 5 min to keep it awake

## Result
✅ Agent runs 24/7 on free tier
✅ Develops your app automatically
✅ Costs: $0

## Check Progress
Monitor in Render logs:
- Dashboard → Your app → Logs

Or check memory files:
- `/swarm/memory/session.json`
- `/swarm/memory/learnings.json`

## Important Notes
- **Free tier limit:** 750 hours/month = ~25 hours/day
- **UptimeRobot:** Keeps service awake during downtime
- **Proximity app:** Will need to be cloned on Render or stored in Supabase
