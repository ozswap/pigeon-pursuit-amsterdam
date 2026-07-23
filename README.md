# Canal Courier: Pigeon Peril

A retro pixel-art endless runner — dodge aggressive Amsterdam pigeons while delivering bagels by bicycle.

## Stack

- **Frontend**: React + Vite + Phaser 3 (320×180, CRT shader)
- **Hosting**: Cloudflare Pages (free tier)

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

## Deploy to Cloudflare Pages (Free Tier)

The game is a static Vite build in `client/dist`. Use either dashboard connect or the included GitHub Action.

### Build settings (dashboard connect)

| Setting | Value |
|---------|-------|
| Framework preset | None |
| Build command | `npm install && npm run build` |
| Build output directory | `client/dist` |
| Root directory | `/` (repo root) |
| Node.js version | 20 |

### Option A — GitHub Action (recommended)

This repo includes `.github/workflows/cloudflare-pages.yml`. It builds on every push to `main` and deploys to Cloudflare Pages.

1. Create a Cloudflare Pages project (one-time):
   - [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
   - Select `ozswap/pigeon-pursuit-amsterdam`, then **Save and Deploy** (the first deploy can fail until secrets are set — that is fine)
   - Project name: `pigeon-pursuit-amsterdam` (matches the workflow)
2. Get your **Account ID**: Dashboard → any domain or Workers & Pages → right sidebar **Account ID**
3. Create an **API token**:
   - [Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
   - Use template **Edit Cloudflare Workers** (includes Pages deploy permissions), or create a custom token with:
     - **Account** → **Cloudflare Pages** → **Edit**
4. Add GitHub repository secrets (`Settings` → **Secrets and variables** → **Actions**):
   - `CLOUDFLARE_API_TOKEN` — token from step 3
   - `CLOUDFLARE_ACCOUNT_ID` — account ID from step 2
5. Push to `main` or run **Deploy to Cloudflare Pages** manually from the Actions tab

Live URL: `https://pigeon-pursuit-amsterdam.pages.dev` (or your custom domain).

### Option B — Cloudflare dashboard only

Skip the GitHub Action and let Cloudflare build from Git:

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select `ozswap/pigeon-pursuit-amsterdam` and branch `main`
3. Use the build settings table above
4. **Save and Deploy**

Cloudflare rebuilds automatically on each push to `main`.

## GitHub Account

This project uses the **ozswap** GitHub account for repo and deployment integration.

## License

MIT
