# LOCKD-IN 🔒

A fast-paced AI-powered multiplayer trivia game. Players pick topics, an AI generates live questions, and everyone races to answer in 15 seconds.

---

## Deploying for Free (Railway)

Railway is the best free option for this stack — it supports persistent Node.js servers and WebSockets, which this game requires. Vercel/Netlify will **not** work because they're serverless and can't maintain the Socket.IO connections the game depends on.

### What you need before starting

- A [GitHub](https://github.com) account
- A [Railway](https://railway.app) account (free, sign up with GitHub)
- An [OpenAI API key](https://console.groq.com)

---

### Step 1 — Push to GitHub

```bash
# In the project folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/lockd-in.git
git branch -M main
git push -u origin main
```

---

### Step 2 — Deploy on Railway

1. Go to [railway.app](https://railway.app) and click **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your `lockd-in` repository
4. Railway will auto-detect the config from `railway.toml` and start building

---

### Step 3 — Set Environment Variables

In Railway, go to your service → **Variables** tab and add:

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | `sk-...` your OpenAI key |
| `CLIENT_ORIGIN` | your Railway URL (see Step 4) |
| `NODE_ENV` | `production` |

---

### Step 4 — Set your Public URL

1. In Railway, go to your service → **Settings** → **Networking**
2. Click **Generate Domain** — you'll get a URL like `lockd-in.up.railway.app`
3. Go back to **Variables** and set `CLIENT_ORIGIN` to that full URL (e.g. `https://lockd-in.up.railway.app`)
4. Trigger a redeploy (Railway → your service → three dots → Redeploy)

Your game is now live. Share the URL with friends.

---

### Custom Domain (optional, free)

If you own a domain:
1. Railway → Settings → Networking → **Custom Domain**
2. Add your domain and follow the DNS instructions
3. Update `CLIENT_ORIGIN` to your custom domain URL

---

## Running Locally

```bash
# Install dependencies
npm install

# Create your local env file
cp .env.example .env
# Edit .env and add your OpenAI API key

# Start dev server
npm run dev
```

Game runs at `http://localhost:5000`

---

## Building for Production

```bash
npm run build   # builds client + server into dist/
npm start       # runs the production build
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | ✅ | OpenAI API key for question generation |
| `CLIENT_ORIGIN` | ✅ in prod | Your public URL — prevents CORS issues |
| `NODE_ENV` | ✅ in prod | Set to `production` |
| `AI_MODEL` | optional | Override AI model (default: `gpt-4o`) |
| `PORT` | optional | Port to listen on (Railway sets this automatically) |
| `DATABASE_URL` | optional | PostgreSQL URL for future persistence |

---

## Free Tier Limits (Railway)

Railway's free tier gives you $5/month of compute credit. This game is lightweight — a typical session costs fractions of a cent. At idle the server uses very little CPU.

If you expect heavy traffic, Railway's paid plan is $20/month for 8GB RAM.

---

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + Framer Motion
- **Backend**: Node.js + Express + Socket.IO
- **AI**: OpenAI GPT-4o for question generation
- **Real-time**: WebSockets via Socket.IO
- **State**: In-memory (no database required)
