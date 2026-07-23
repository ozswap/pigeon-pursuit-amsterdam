# Canal Courier: Pigeon Peril

A retro pixel-art endless runner — dodge aggressive Amsterdam pigeons while delivering bagels by bicycle.

## Stack

- **Frontend**: React + Vite + Phaser 3 (320×180, CRT shader)
- **Hosting**: [Render Static Site](https://render.com/docs/static-sites) (recommended) or GitHub Pages

The game runs fully in the browser with local storage for best score, cumulative progress, and unlocks. No backend required.

## Local Development

```bash
npm install
npm run dev          # client at http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the game client |
| `npm run build` | Build the static site |
| `npm run pack-atlas` | Slice sprite sheets into atlas frames |

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Jump | Space / ↑ | Tap right half |
| Duck | ↓ | Swipe down |
| Speed up | → (hold) | Hold right |
| Brake | ← (hold) | Hold left |

## Deploy to Render (recommended)

Static sites are **free** on Render. You need a **Hobby workspace** (also free — sign up at [render.com](https://render.com) and create one if prompted).

### Option A — Dashboard (manual, dead simple)

1. Log in to Render with a **Hobby workspace** selected (top-left workspace switcher).
2. Click **New +** → **Static Site**.
3. Connect GitHub account **ozswap** and select repo **pigeon-pursuit-amsterdam**.
4. Use these exact settings:

| Field | Value |
|-------|-------|
| **Name** | `canal-courier-web` |
| **Branch** | `main` |
| **Root Directory** | *(leave blank)* |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `client/dist` |
| **Environment Variables** | *(none — leave empty)* |

5. Click **Create Static Site**. First deploy takes ~2–3 minutes.
6. Live URL will be `https://canal-courier-web.onrender.com` (or similar).

No API keys, no backend, no env vars. Push to `main` triggers auto-redeploy if the site is connected to the repo.

### Option B — Blueprint (optional)

This repo includes `render.yaml` at the root with the same settings. In Render: **New +** → **Blueprint** → connect the repo → apply. Requires Hobby workspace with billing info on file (Render may ask once even for free tier).

## Deploy to GitHub Pages (optional)

The game is a static Vite build in `client/dist`. This repo includes `.github/workflows/github-pages.yml`, which builds on every push to `main`.

### One-time setup

1. Open **Repo Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` (or run **Deploy to GitHub Pages** manually from the Actions tab)

The workflow runs `npm install && npm run build` from the repo root and publishes `client/dist`.

Live URL: [https://ozswap.github.io/pigeon-pursuit-amsterdam/](https://ozswap.github.io/pigeon-pursuit-amsterdam/)

## GitHub Account

This project uses the **ozswap** GitHub account for repo and deployment integration.

## License

MIT
