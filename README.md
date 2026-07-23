# Canal Courier: Pigeon Peril

A retro pixel-art endless runner — dodge aggressive Amsterdam pigeons while delivering bagels by bicycle.

## Stack

- **Frontend**: React + Vite + Phaser 3 (320×180, CRT shader)
- **Hosting**: GitHub Pages (free tier)

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

## Deploy to GitHub Pages

The game is a static Vite build in `client/dist`. This repo includes `.github/workflows/github-pages.yml`, which builds on every push to `main` and deploys with the official GitHub Actions (`upload-pages-artifact` + `deploy-pages`). No API tokens or repository secrets are required — deployment uses the built-in `GITHUB_TOKEN`.

### One-time setup

1. Open **Repo Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` (or run **Deploy to GitHub Pages** manually from the Actions tab)

The workflow runs `npm ci && npm run build` from the repo root and publishes `client/dist`.

Live URL: [https://ozswap.github.io/pigeon-pursuit-amsterdam/](https://ozswap.github.io/pigeon-pursuit-amsterdam/)

## GitHub Account

This project uses the **ozswap** GitHub account for repo and deployment integration.

## License

MIT
