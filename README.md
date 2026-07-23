# Canal Courier: Pigeon Peril

A retro pixel-art endless runner — dodge aggressive Amsterdam pigeons while delivering bagels by bicycle.

## Stack

- **Frontend**: React + Vite + Phaser 3 (320×180, CRT shader)
- **Backend**: Node.js + Express (in-memory leaderboard)
- **Hosting**: Render (free tier)

## Local Development

```bash
npm install
npm run dev          # client :5173 + server :3001
npm run dev:client   # frontend only
npm run dev:server   # API only
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run client + server concurrently |
| `npm run build` | Build both workspaces |
| `npm run test` | Run server Jest tests |
| `npm run pack-atlas` | Slice sprite sheets into atlas frames |

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Jump | Space / ↑ | Tap right half |
| Duck | ↓ | Swipe down |
| Speed up | → (hold) | Hold right |
| Brake | ← (hold) | Hold left |

## Deploy to Render (Free Tier)

1. Install Render CLI: `brew install render && render login`
2. Push to GitHub: `github.com/ozswap/pigeon-pursuit-amsterdam`
3. Render Dashboard → **New Blueprint** → connect ozswap repo
4. Apply `render.yaml`

### Free Tier Notes

- **Static site** (game): always on
- **Web service** (API): spins down after 15 min idle (~1 min cold start)
- **Leaderboard**: stored in memory — resets when the API restarts or redeploys

## GitHub Account

This project uses the **ozswap** GitHub account for repo and Render integration.

## License

MIT
