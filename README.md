# Canal Courier: Pigeon Peril

A retro pixel-art endless runner — dodge aggressive Amsterdam pigeons while delivering bagels by bicycle.

## Stack

- **Frontend**: React + Vite + Phaser 3 (320×180, CRT shader)
- **Hosting**: [Vercel](https://vercel.com) (static site)

The game runs fully in the browser with local storage for best score, cumulative progress, and unlocks. No backend required.

## Local Development

```bash
npm install
npm run dev          # client at http://localhost:5173
```

### Single-file HTML

For a portable, self-contained build (e.g. open locally or upload anywhere):

```bash
npm run build:single
```

Output:

- `client/dist-single/index.html` — Vite single-file build
- `dist/canal-courier.html` — copy at repo root for easy sharing

The file inlines JS, CSS, and sprite PNGs as base64. Google Fonts still load from the network unless you are offline.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the game client |
| `npm run build` | Build the static site |
| `npm run build:single` | Build one self-contained HTML file (`dist/canal-courier.html`) |
| `npm run pack-atlas` | Slice sprite sheets into atlas frames |

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Jump | Space / ↑ | Tap right half |
| Duck | ↓ | Swipe down |
| Speed up | → (hold) | Hold right |
| Brake | ← (hold) | Hold left |

## Deploy to Vercel

This repo includes `vercel.json` at the root for a monorepo static deploy.

### One-time setup

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New…** → **Project** → import **ozswap/pigeon-pursuit-amsterdam**.
3. Vercel reads `vercel.json` automatically. Confirm these settings:

| Field | Value |
|-------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | *(leave blank — repo root)* |
| **Build Command** | `npm install && npm run build` |
| **Output Directory** | `client/dist` |
| **Environment Variables** | *(none — leave empty)* |

4. Click **Deploy**. Push to `main` triggers auto-redeploy.

No API keys, no backend, no env vars.

## GitHub Account

This project uses the **ozswap** GitHub account for repo and deployment integration.

## License

MIT
