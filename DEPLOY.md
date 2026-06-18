# Deploying to Vercel (GitHub → Vercel)

## Prerequisites
- A [Vercel](https://vercel.com) account
- A PostgreSQL database (e.g. [Neon](https://neon.tech) free tier)
- An [OpenRouter](https://openrouter.ai/keys) API key
- A Telegram bot (for payment approval notifications)

---

## Step 1 — Create a Telegram Bot (for payment approvals)

1. Open Telegram → search for **@BotFather**
2. Send `/newbot` → follow the steps → you'll get a **bot token** like `123456:ABCdef...`
3. Add your bot to your Telegram channel/group as an **admin**
4. Get your channel/chat ID:
   - Forward a message from your channel to **@userinfobot**
   - Or use `https://api.telegram.org/bot<TOKEN>/getUpdates` after messaging the bot

---

## Step 2 — Push to GitHub
Push this repository to GitHub as-is.

---

## Step 3 — Import project into Vercel
1. Go to [vercel.com/new](https://vercel.com/new) → "Import Git Repository"
2. Select your GitHub repo
3. Keep **Root Directory** as `.` (repo root)
4. Vercel auto-detects `vercel.json` — do **not** override Build Command or Output Directory

---

## Step 4 — Set environment variables in Vercel
In Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host/dbname` |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` |
| `APP_URL` | `https://your-project.vercel.app` |
| `TELEGRAM_BOT_TOKEN` | `123456:ABCdef...` (from BotFather) |
| `TELEGRAM_CHAT_ID` | `-100123456789` (your channel/group ID) |
| `SESSION_SECRET` | any random 32-char string |

---

## Step 5 — Run the database migration (once after first deploy)

```bash
pnpm install
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push
```

---

## Step 6 — Deploy & register the Telegram webhook

1. Click **Deploy** in Vercel
2. After deploy succeeds, visit:
   ```
   https://your-project.vercel.app/api/telegram/setup
   ```
   This registers the Telegram webhook so your bot receives approve/reject callbacks.

---

## How payments work

1. User hits the **20-message free limit** → Premium modal appears
2. User sends USDT to your wallet address (ERC20 / TRC20 / BEP20)
3. User pastes their TX hash and clicks **Submit Payment Claim**
4. You receive a Telegram message like:
   ```
   🔔 New Premium Payment Claim
   Client ID: abc123def456…
   Plan: Monthly ($29)
   Network: USDT ERC20
   TX Hash: 0x...
   ```
   With **[✅ Approve]** and **[❌ Reject]** buttons
5. Click **Approve** → user instantly gets premium access
6. Click **Reject** → user's claim is rejected

---

## Wallet addresses (already hardcoded in the app)

| Network | Address |
|---|---|
| USDT ERC20 | `0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7` |
| USDT TRC20 | `TFRDatJUdNQLYiF7BqQKQi8YFKQ1FBuAGn` |
| USDT BEP20 | `0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7` |

---

## Local development

```bash
pnpm install
cp .env.example .env
# Fill in env vars in .env

# Start the API (port 8080)
pnpm --filter @workspace/api-server run dev

# Start the frontend (port 5173)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/chat-app run dev
```
