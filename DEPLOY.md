# Deploy: Hostinger + GitHub + Supabase

API + staff scanner (`/scanner`) deploy to Hostinger Node.js Web Apps with auto-redeploy on GitHub push. Postgres lives on Supabase. The Expo member app is **not** hosted here (use EAS builds).

## 1. Create the GitHub repo

Do **not** share your GitHub password in chat. Use the browser login flow.

### Option A — GitHub CLI (recommended)

```bash
# If gh is not on your PATH yet (we installed a local copy):
export PATH="$HOME/.local/bin:$PATH"

gh auth login
# GitHub.com → HTTPS → Login with a web browser → paste the code

cd "/Users/macbookair/Downloads/Check-in app"
gh repo create checkin-app --private --source=. --remote=origin --push
```

### Option B — Browser

1. Open https://github.com/new
2. Repository name: `checkin-app` (or any name)
3. Visibility: **Private**
4. Do **not** add a README, .gitignore, or license (empty repo)
5. Click **Create repository**
6. Copy the repo URL and push from this project:

```bash
cd "/Users/macbookair/Downloads/Check-in app"
git remote add origin https://github.com/YOUR_USER/checkin-app.git
git push -u origin main
```

## 2. Create Supabase Postgres

1. Sign up / log in at https://supabase.com
2. **New project** → pick org, name, strong DB password, region close to Hostinger
3. Wait until the project is healthy
4. Open **Project Settings → Database**
5. Under **Connection string**, choose **URI**
6. Prefer the **Session** pooler (or **Direct** connection) for this long-lived Express app
7. Replace `[YOUR-PASSWORD]` with the database password
8. Ensure the URI includes SSL, e.g. `?sslmode=require`

Example shape (yours will differ):

```text
postgresql://postgres.xxxxxxxxxxxx:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require
```

### Run migrations

Migrations also run automatically on every Hostinger `npm start`. To run them once from your Mac:

```bash
cd "/Users/macbookair/Downloads/Check-in app"
export DATABASE_URL='postgresql://...sslmode=require'
# Also need the other required env vars for config parse, or use a minimal .env
cd apps/api && npm run build && DATABASE_URL="$DATABASE_URL" \
  JWT_ACCESS_SECRET=temp-access-secret-min-16 \
  JWT_REFRESH_SECRET=temp-refresh-secret-min-16 \
  STAFF_PIN=1234 \
  npm run migrate
```

## 3. Hostinger Node.js app (GitHub auto-deploy)

Requires **Business** (or Cloud) plan with Node.js Web Apps.

1. hPanel → **Websites** → **Add Website** → **Node.js web app**
2. **Import Git repository** → **Connect with GitHub** → authorize the Hostinger GitHub App → select `checkin-app`
3. Deploy settings:

| Setting | Value |
| --- | --- |
| Framework | Express (or Other) |
| Branch | `main` |
| Node.js version | **20** |
| Root directory | leave **empty** (repo root) |
| Build command | `npm run build` |
| Entry file | `apps/api/dist/index.js` (or rely on `npm start` if offered) |

4. Add **Environment variables** (see below) → **Deploy**
5. Every push to `main` rebuilds and restarts automatically
6. Smoke test:
   - `https://dashboard.nouraiz.com/health`
   - `https://dashboard.nouraiz.com/scanner/` (staff PIN)

## 4. Environment variables (Hostinger)

Set these in hPanel → Environment variables. Do **not** commit secrets.

| Variable | Example / notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://dashboard.nouraiz.com` |
| `DATABASE_URL` | Supabase URI with `sslmode=require` (project `oimnlcqzyrcwonohccku`) |
| `JWT_ACCESS_SECRET` | long random string (16+ chars) |
| `JWT_REFRESH_SECRET` | long random string (16+ chars) |
| `STAFF_PIN` | staff scanner PIN |
| `SKIP_SMS_OTP` | `true` until Twilio is live |
| `MOCK_INTEGRATIONS` | `false` for live GHL |
| `GHL_ACCESS_TOKEN` | Private Integration token |
| `GHL_LOCATION_ID` | GHL location id |
| `GHL_POINTS_FIELD_KEY` | e.g. `checkin_points` |
| `GHL_POINTS_FIELD_ID` | optional field id |
| `OUTBOX_POLL_INTERVAL_MS` | `3000` |
| `OUTBOX_MAX_ATTEMPTS` | `8` |

Do **not** override Hostinger’s injected `PORT` unless support tells you to.

Leave `PUBLIC_HTTPS_BASE_URL` unset — Hostinger terminates TLS at the edge for `dashboard.nouraiz.com`.

## 5. Keep-alive (outbox on Hostinger)

Hostinger **stops idle Node processes**. The outbox `setInterval` only runs while the app is awake. Mitigations already in code:

1. After a successful staff validate, the API drains pending outbox tasks immediately
2. While awake, the poller still runs every few seconds

**You still need a keep-alive ping** so GHL sync can retry if a push failed and no one is scanning:

1. Create a free monitor at [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com)
2. HTTP **GET** `https://dashboard.nouraiz.com/health` every **1–2 minutes**
3. Confirm `/health` returns `{"ok":true,...}`

## 6. Subdomain — `dashboard.nouraiz.com` (scanner dashboard)

This Hostinger Node app is the **staff scanner dashboard** (not the Expo member app).

1. In hPanel → **Domains** (or the Node.js website settings): attach / park subdomain **`dashboard.nouraiz.com`** to this Node.js web app
2. If DNS is at Hostinger: add an **A** record for `dashboard` pointing at the hosting IP Hostinger shows (or use their “Add subdomain” wizard)
3. If DNS is elsewhere (Cloudflare, etc.): create **A**/ **CNAME** as Hostinger instructs for that subdomain
4. Wait for SSL (Let’s Encrypt) to become active on `https://dashboard.nouraiz.com`
5. Set Hostinger env `PUBLIC_BASE_URL=https://dashboard.nouraiz.com` and **redeploy/restart**
6. Open:
   - Staff UI: https://dashboard.nouraiz.com/scanner/
   - Health: https://dashboard.nouraiz.com/health

## Local vs production

| | Local | Hostinger |
| --- | --- | --- |
| DB | Docker / embedded Postgres | Supabase |
| HTTPS | Optional self-signed on `:3443` | Platform TLS |
| Start | `npm run dev` in `apps/api` | `npm run build` then `npm start` (migrates then serves) |
| Scanner | `/scanner/` on API host | same |
