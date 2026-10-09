# Train prototype (working title)

Gray-box desktop browser prototype of a single-player, real-time train survival/strategy game.
Design source: [`TRAIN_GAME_DESIGN.md`](TRAIN_GAME_DESIGN.md). This is **Milestone 1**: the core
move/stop/fuel/combat loop on one level. It is meant to answer one question: *is the stop-vs-move
tension fun?*

**Play online:** https://garik-sargis.github.io/Pongobongoboy/ (redeployed automatically on every push to
`train-prototype` or `master` by `.github/workflows/pages.yml`, after the tests pass).

## Run it locally

Needs Node 18+ (no dependencies to install).

```sh
npm start          # serves http://localhost:8080 — open it in a desktop browser
npm test           # headless simulation tests
node scripts/botrun.js 10   # a naive bot plays 10 seeds; quick balance sanity check
```

Opening `index.html` straight from disk will not work (browsers block ES modules on `file://`);
any static server is fine.

## How to play

Get the train to the **EXIT** tunnel. You lose if the locomotive is destroyed or every crew member dies.

| Input | Action |
|---|---|
| `Space` / GO button | Start / stop the train |
| Click crew, `1` `2`, crew cards | Select (`Shift` adds) |
| Click with crew selected (left or right) | Ground: move · deposit: gather · train: board |
| `R` | Recall all crew |
| Click a car (nothing selected) | Inspect; **Repair** with scrap while stopped |
| `A`/`D`, arrows, wheel, route bar | Look ahead/behind · `F` follow train |
| `P` / `H` / `Esc` | Pause / help / deselect |
| Debug: `G` `K` `N` `T` | +fuel · damage engine · toggle spawns · 2× speed |

## What's in Milestone 1

- One level (~1160 m) with 4 fuel and 4 scrap deposits, some near the track, some far away.
- Train: locomotive + turret car + fuel tank car. Fuel burn per 100 px = `base + perCar × cars`.
- Two generalist crew: move / gather / board orders, automatic shooting.
- Enemies: **shooter** and **rusher** (fast, explodes on contact, visually loud, shot first).
- Threat meter: rises while stopped, eases while moving; drives spawn rate, group size and rusher share.
- Scrap → repair any car while stopped. Disabled cars lose their function.
- Win / two loss conditions with explicit reasons.

**Not yet built (Milestone 2, per design doc Phase 3):** car reordering, ram car + barricade,
detaching cars, salvageable cars, survivors. See `ASSUMPTIONS.md` for every default chosen.

## Code layout

```
index.html            page, HUD markup, styles
src/config.js         every tuning number (edit freely)
src/level.js          level data: length, deposits
src/sim/              pure simulation — no DOM; runs headless in tests
  state.js            state creation, shared helpers
  train.js            cars, movement, fuel, turret, repair
  crew.js             orders, gathering, boarding, crew combat
  enemies.js          enemy AI
  combat.js           targeting & damage
  spawner.js          threat and spawning
  rules.js            win / loss
  game.js             fixed-step update + debug actions
src/render/           canvas renderer, camera, DOM HUD (read-only views of state)
src/input.js          mouse/keyboard → sim commands
tests/                node:test suite
scripts/              static server, balance bot
```
