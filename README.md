# Train prototype (working title)

Gray-box desktop browser prototype of a single-player, real-time train survival/strategy game.
Design source: [`TRAIN_GAME_DESIGN.md`](TRAIN_GAME_DESIGN.md). Current state: **Milestone 3**.

- **Milestone 1:** the core move/stop/fuel/combat loop.
- **Milestone 2:** the train as a base (reorder, ram, salvage, detach, rescue).
- **Milestone 3:** the content layer, which adds:
  - three levels, a depot to buy your train
  - weapon, defence, utility and vehicle cars; sentries
  - six enemy types and nests
  - a much taller map with fog of war
  - physical hauling of resources

**Play online:** https://garik-sargis.github.io/Pongobongoboy/ (redeployed automatically on every push to
`train-prototype` or `master` by `.github/workflows/pages.yml`, after the tests pass).

## Run it locally

Needs Node 18+ (no dependencies to install).

```sh
npm start                          # serves http://localhost:8080 — open it in a desktop browser
npm test                           # headless simulation tests
node scripts/botrun.js 3           # a simple bot plays every level on 3 seeds (balance check)
node scripts/botrun.js 5 hive      # ...or just one level
```

Opening `index.html` straight from disk will not work (browsers block ES modules on `file://`).

## How to play

Pick a line, spend your scrap budget on cars at the depot (unspent scrap comes along for repairs), then get
the train to the **EXIT** tunnel. You lose if the locomotive is destroyed or every crew member dies.

| Input | Action |
|---|---|
| `Space` / GO | Start / stop the train |
| Click a unit, `1`–`6`, unit cards | Select crew / vehicles (`Shift` adds) |
| Click (left or right) with units selected | Ground: move · deposit: dig & haul · wreck: salvage · barricade: tear down · survivor: rescue · own sentry: pack up · nest: attack from range · train: board/dock |
| `B` (crew selected) | Fetch a kit from the armoury car and build a sentry gun where you click |
| Click a car / its chip | Inspect · while stopped: repair, shunt `Q` (rear) / `E` (front), `V` deploy its vehicle |
| `X` | Detach the rear car (works while moving) |
| `R` | Recall everyone |
| Wheel · `WASD`/arrows · `F` · map strip | Zoom · pan · follow train · jump |
| `P` / `H` / `Esc` | Pause / help / deselect or cancel placement |
| Debug: `G` `K` `N` `M` `T` | +fuel · damage engine · spawns on/off · fog on/off · 2× speed |

`window.__train` in the browser console gives live access to the game state for tuning.

## What's in the game

**Levels** (`src/data/levels.js`). Deposits and nests are generated per zone from the level seed, so a
level is the same every time. Set pieces (barricades, wrecks, survivors) are hand-placed.

| | Length | Crew | Budget | Character |
|---|---|---|---|---|
| Green Valley (Easy) | 1300 m | 3 | 140 | Fuel near the track, 3 nests, two barricades. |
| Ash Flats (Medium) | 1600 m | 2 | 180 | Stock up first: the middle is barren, watched by snipers and brutes. One reinforced barricade. |
| Hive Line (Hard) | 1800 m | 2 | 260 | Nests everywhere, mortars, faster escalation, two reinforced barricades. |

**Cars** (`src/data/cars.js`). Buy them at the depot or salvage them from wrecks.

| Category | Cars |
|---|---|
| Weapon | **Gun turret** (fast, medium range, weak vs armour) · **Cannon** (long range, splash, ignores armour, minimum range) · **Flamer** (burns everything close) |
| Defence | **Armour car** (neighbours take −35% damage) · **Shield car** (bubble that soaks damage, recharges) · **Mine layer** (rear only; mines behind a moving train) · **Ram car** (front only; cheap ramming, breaks reinforced barricades) |
| Utility | **Fuel tank** (+60 capacity) · **Crane** (while stopped, lifts from deposits within reach of that car) · **Workshop** (while stopped, auto-repairs itself and neighbours for scrap) · **Armoury** (2 sentry-gun kits) |
| Vehicle bays | **Tank bay** (a crew member drives a tank: armoured, strong gun, faster than the train) · **Excavator bay** (digs ~3× faster, hauls 40 per trip, clears barricades 4× faster) |

Every car adds weight → more fuel burn. Position matters: ram at the front, mine layer at the rear,
weapons cover only their range, armour protects only its neighbours, the crane only reaches nearby deposits.

**Enemies** (`src/data/enemies.js`):
- **Shooter:** basic ranged.
- **Rusher:** fast; explodes on contact.
- **Swarmer:** packs of 5–8.
- **Brute:** armoured; smashes cars.
- **Sniper:** long range; you see its aiming laser before it fires.
- **Mortar:** lobs shells; a ring marks where each one will land.
- **Nests** sit out in the wilds. They wake when you come close (or stop the train near one), spawn
  leashed defenders, go dormant again if left alone, and leave a big scrap pile when destroyed.

**Hauling:** crew dig a load (12) at a deposit, carry it back to the train, and return until the deposit
is empty. The excavator carries 40. The crane lifts straight into the train. Clearing a barricade or
destroying a nest leaves a scrap pile that has to be hauled too.

**Fog of war:** unexplored ground is black. Explored ground you aren't watching is dimmed and hides
enemies. The railway and its barricades are always visible.

## Code layout

```
index.html              page, HUD, level select, depot, help, end screens
src/config.js           core tuning numbers (imports the data files)
src/data/cars.js        car, vehicle and sentry definitions
src/data/enemies.js     enemy and nest definitions
src/data/levels.js      the three levels
src/sim/                pure simulation — no DOM; runs headless in tests
  state.js              state creation, shared helpers
  levelgen.js           zone-based deposit/nest placement
  train.js              car layout, movement, fuel, barricades, mine laying, repair
  consist.js            reorder / detach / attach cars
  units.js              crew + vehicles: orders, hauling, sentry building, deploy/dock
  sites.js              work sites: wrecks, barricades, survivors, sentries
  weapons.js            gun / cannon / flame weapons for cars, sentries, tank, crew; mines
  defense.js            shield recharge, workshop repair, crane
  combat.js             targeting & damage (armour adjacency, shields)
  enemies.js            enemy AI behaviours, mortar shells, nests
  spawner.js            threat and spawning
  fog.js                fog of war
  loadout.js            depot purchase logic
  rules.js              win / loss
  game.js               fixed-step update + debug actions
src/render/             canvas renderer, camera, DOM HUD (read-only views of state)
src/input.js            mouse/keyboard → sim commands
src/main.js             screens and game loop
tests/                  node:test suite (fixtures.js holds a small hand-made test level)
scripts/                static server, balance bot
```
