# COLLECTOPIA

A mobile-first 3D endless runner through a stylised Indian neighbourhood, built with Vite, TypeScript and Three.js.

## Implemented scope

- Three-lane automatic running with swipe, drag, arrow-key and A/D steering.
- Gold coins collected exactly once, with floating `+10` feedback.
- Two navigable 3D river gates per encounter, offering one of seven values: `+100`, `−50`, `−100`, `×1`, `×2`, `÷2` or `÷4`; only the gate the boat fits through is applied.
- Lifetime coin tracking that biases gate choices toward tougher decisions after 200,000 coins.
- Five power-ups: Magnet (5 s), Shield (one hit), Super Punch (8 s), Double Coins (6 s), Freeze (5 s).
- Obstacles and enemies, punch combat, breakable walls and shield interactions.
- Obstacle collisions end the run; the results screen reports distance, level, coins, gates, enemies and final balance.
- Each completed local demo video can revive the run after a fatal obstacle collision; progress is preserved and every revive grants two seconds of invulnerability.
- In-place restart with a fresh run balance while lifetime collected coins persist.
- Ten authored levels followed by generated endless levels, with capped speed and difficulty scaling.
- Difficulty tiers for intro, moderate, complex and endless play, plus cross-system spawn reservations.
- HUD with balance, level, progress, pause, power-up timers and punch cooldown.
- Procedural Indian street environment with seven zone themes and smooth transitions.
- Five static Spryntworks advertising formats, with logo aspect ratio preserved.
- Web Audio cues for coins, gates, power-ups, punching, collisions and results.

No jump or slide controls exist by design.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. The Vite server is exposed on the network for testing on a phone.

## Build and test

```bash
npm run build
npm test
```

`npm run build` runs the strict TypeScript check and produces a production build in `dist/`. The current suite contains 147 tests across 9 files.

## Controls

- Swipe or drag left/right on the game to change lanes.
- `←` / `→` or `A` / `D` to change lanes on a keyboard.
- `F` or `Space` to punch.
- `Esc` or `P` to pause and resume.
- The on-screen Punch button works on touch devices.

## Project structure

```text
src/
  assets/       Procedural canvas textures and branding loaders
  audio/        Small Web Audio effects
  collectibles/ Instanced coins, magnet attraction and particles
  config/       Balance, difficulty, level, zone and advertising config
  core/         Loop, clock, RNG, device quality, reservations and baking
  economy/      Gate math, ledger types and EconomyManager
  enemies/      Enemy models, behaviours and punch system
  game/         Game orchestration, results and restart
  gates/        Gate meshes and gate spawning/crossing logic
  input/        Pointer, touch and keyboard controls
  obstacles/    Obstacle models, collision rules and spawning
  player/       Animated runner model
  powerups/     Power-up models, system and timers
  styles/       HUD, overlays and results styling
  ui/           DOM HUD
  world/        Theme-aware environment, street builder and ads
tests/          Economy, gates, levels, difficulty, power-ups, ads and systems
```

The economy is the only authority for balance changes. Every coin, gate and reward submits a unique source ID, so each collectible or decision affects the balance at most once.

## Docs

- `COLLECTOPIA_PRD_v1.0.md` — product requirements
- `CODEBASE_AUDIT.md` — repository audit
- `TECHNICAL_PLAN.md` — architecture and delivery plan
- `IMPLEMENTATION_TRACKER.md` — phase status
- `COLLECTOPIA_PROGRESS_REPORT.md` — implementation and verification reports
