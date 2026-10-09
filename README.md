# Train prototype (working title)

Gray-box desktop browser prototype of a single-player, real-time train survival/strategy game.
Design source: [`TRAIN_GAME_DESIGN.md`](TRAIN_GAME_DESIGN.md). Current state: **Milestone 2**.
Milestone 1 built the core move/stop/fuel/combat loop; Milestone 2 adds the train-as-a-base layer:
reordering, ramming, salvaging, detaching and rescuing. The question it tests: *does the physical
make-up of the train create real decisions?*

**Play online:** https://garik-sargis.github.io/Pongobongoboy/ (redeployed automatically on every push to
`train-prototype` or `master` by `.github/workflows/pages.yml`, after the tests pass).

## Run it locally

Needs Node 18+ (no dependencies to install).

```sh
npm start          # serves http://localhost:8080 — open it in a desktop browser
npm test           # headless simulation tests
node scripts/botrun.js 10   # a naive bot plays 10 seeds; quick balance sanity check
node scripts/botrun.js 5 --ram --far   # bot that salvages the ram car and uses far deposits
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
| Click with crew selected on a wreck / barricade / survivor | Salvage it onto the train / tear it down / rescue them |
| Click a car or its chip in the Train strip | Inspect; while stopped: **Repair** with scrap, shunt with `Q` (toward rear) / `E` (toward front) |
| `X` | Detach the rear car (works while moving) |
| `A`/`D`, arrows, wheel, route bar | Look ahead/behind · `F` follow train |
| `P` / `H` / `Esc` | Pause / help / deselect |
| Debug: `G` `K` `N` `T` | +fuel · damage engine · toggle spawns · 2× speed |

## What's in the game

### Milestone 2: train composition
- **Reordering:** stopped-only, 1.5 s of "shunting" per swap during which the train can't depart (attacks continue).
- **Barricades** (2 on the level, strength 70 and 140): whatever car is at the **front** takes the hit.
  The locomotive takes full damage; a **ram car** at the front takes 15%. Too slow (e.g. out of fuel)
  and the train just stops against it. Crew can also tear one down by hand while stopped (yields scrap).
- **Ram car** (new, heavy: weight 1.5 vs 1): only useful at the front. Obtained by salvaging a wreck.
- **Salvage:** two wrecks (a damaged ram car before barricade 1, a turret car late on). Crew work on it
  while the train is stopped nearby; the car joins at the rear, damaged.
- **Detach:** drop the rear car any time, even while moving. Lighter train, lower fuel burn. The car stays
  behind as a wreck that can be re-attached.
- **Survivor:** one, off the track. Send crew to them and they join as a third crew member.
- Fuel burn now uses car **weight**, and the Train strip shows the composition (rear → front).

### Milestone 1: core loop

- One level (~1160 m) with 4 fuel and 4 scrap deposits, some near the track, some far away.
- Train: locomotive + turret car + fuel tank car. Fuel burn per 100 px = `base + perCar × cars`.
- Two generalist crew: move / gather / board orders, automatic shooting.
- Enemies: **shooter** and **rusher** (fast, explodes on contact, visually loud, shot first).
- Threat meter: rises while stopped, eases while moving; drives spawn rate, group size and rusher share.
- Scrap → repair any car while stopped. Disabled cars lose their function.
- Win / two loss conditions with explicit reasons.

**Not built yet (design doc Phase 4, only if Phase 3 is compelling):** a crew-operated vehicle
(tank or excavator), a deployable sentry, more encounter variety, a second zone, a route map.
See `ASSUMPTIONS.md` for every default chosen.

## Code layout

```
index.html            page, HUD markup, styles
src/config.js         every tuning number (edit freely)
src/level.js          level data: length, deposits
src/sim/              pure simulation — no DOM; runs headless in tests
  state.js            state creation, shared helpers
  train.js            car layout, movement, fuel, barricade collisions, turret, repair
  consist.js          reorder / detach / attach cars
  sites.js            crew work sites: deposits, wrecks, barricades, survivors
  crew.js             orders, walking, boarding, crew combat
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
