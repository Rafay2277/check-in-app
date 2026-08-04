# Check-in App

Member loyalty check-in for a retail counter: Expo member app, staff web scanner, Express + PostgreSQL API.

## Layout

- `apps/api` — Express (TypeScript), migrations, outbox worker, serves `/scanner`
- `apps/scanner` — staff PIN + camera QR page (plain JS)
- `apps/member` — Expo React Native member app

## Quick start

```bash
# 1. Env
cp .env.example .env

# 2. Database
docker compose up -d
cd apps/api && npm install && npm run migrate

# 3. API (+ scanner at /scanner)
npm run dev

# 4. Member app (new terminal)
cd apps/member && npm install && npx expo start
```

With `MOCK_INTEGRATIONS=true`, Twilio/GHL are logged locally (OTP appears in the API console). Default staff PIN: `1234`.

## Production deploy

See [DEPLOY.md](DEPLOY.md) for GitHub → Hostinger auto-deploy, Supabase Postgres, env vars, and keep-alive for the outbox worker.

## Before going live

1. Create a GHL Contacts custom field for loyalty points and set `GHL_POINTS_FIELD_KEY`.
2. Set Twilio + GHL credentials and `MOCK_INTEGRATIONS=false`.
3. Change `STAFF_PIN`, JWT secrets, and use a real `PUBLIC_BASE_URL`.
4. Point the member app `extra.apiBaseUrl` (or `EXPO_PUBLIC_API_BASE_URL`) at your API. On a physical device, use your machine LAN IP, not `localhost`.
