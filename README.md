# Canal Courier: Pigeon Peril

Dodge Amsterdam pigeons while delivering bagels by bicycle. A retro pixel-art endless runner built with React, Vite, and Phaser 3.

## Quick start

```bash
npm install
npm run extract-assets   # once, or after changing raw PNGs
npm run dev              # http://localhost:5173
```

## Build

```bash
npm run build            # static site → client/dist
npm run build:single     # self-contained HTML → dist/canal-courier.html
```

## Deploy (Vercel)

Push to `main` on GitHub. Vercel reads `vercel.json`:

| Setting | Value |
|---------|-------|
| Build Command | `npm install && npm run build` |
| Output Directory | `client/dist` |

No environment variables or backend required.

## Project layout

```
client/
  public/assets/raw/       # source Gemini PNGs (input)
  public/assets/sprites/   # extracted transparent sprites (output)
  src/game/scenes/         # BootScene + GameScene
  src/App.tsx                # menu, HUD, overlays
scripts/extract-assets.mjs   # asset pipeline (run manually)
vercel.json                  # Vercel deploy config
```

## Asset pipeline

Sprites are extracted once at build/dev time — the game loads individual PNGs from `/assets/sprites/`. No runtime sprite-sheet cropping.

```bash
npm run extract-assets
```

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Jump | Space / ↑ | Tap right half |
| Duck | ↓ | — |
| Speed up | → | Hold right |
| Brake | ← | Hold left |

## License

MIT
