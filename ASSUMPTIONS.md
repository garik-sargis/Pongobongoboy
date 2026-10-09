# Assumptions & defaults

Everything here is a placeholder chosen to make the prototype playable. None of it is a final design
decision; change freely. Numbers live in `src/config.js` and `src/data/`.

## Confirmed by the designers

| Topic | Choice |
|---|---|
| Platform | Desktop browser, mouse + keyboard. |
| Crew outside when the train departs | The train **leaves them behind**. A warning shows while units are outside a moving train. |
| Fuel softlock (§14 Q7) | At 0 fuel the train **crawls** at 15% speed. Crawling counts as "stopped" for threat. |
| Crew working under fire (§14 Q6) | Workers **pause digging/work while an enemy is in range** and shoot back (`crew.pauseGatherWhenFighting`). |
| Resource gathering | **Physically hauled**: dig a load, carry it to the train, come back (asked for in Milestone 3). |
| Scope of Milestone 3 | Multiple weapon / defence / utility cars, vehicles, deployables, more enemies, two more levels, a taller map that rewards exploring. Implementer to decide the details (below). |

## Milestone 3 decisions (made by the implementer, as asked)

**Map and exploration**
- Levels are **1400 units tall** (was 600). The track runs through the middle. The camera can now pan vertically and **zoom** (mouse wheel).
- **Fog of war:** unexplored ground is black. Explored ground you aren't currently watching is dimmed, and enemies there are hidden. The train, crew, vehicles and sentries reveal around themselves. The **railway and barricades are always visible**, so you can still plan ahead along the line (§14 Q9).
- Deposits are **generated per zone** from a seed (deterministic). Deposits further from the track are richer. Placement is biased toward the track, so roughly half are within reach of the crane.
- **Nests** (local activation, §8 / §14 Q4) sit 380–700 units from the track, each guarding a rich pile:
  - They wake when a unit or sentry comes within 420, when the train stops within 520, or when one is shot.
  - While awake they spawn their zone's enemy types (max 6 alive at once). Those defenders are **leashed**: they won't chase targets more than 750 from the nest.
  - A nest goes dormant after 20 s with nobody near.
  - Destroying one leaves a 50-scrap pile.
- Global threat escalation still runs alongside, and each level scales it (`threat.baseline / riseMult / intervalMult`). Enemies spawn 520–720 from the train, out in the fog, and walk in.

**Hauling**
- Crew carry **12** per trip and dig 3/s. The excavator carries **40** and digs 7/s. The tank can't dig.
- A full load, or an emptied deposit, sends the unit back to the nearest car to unload, and then back to the deposit until it's empty.
- Boarding or docking unloads whatever is carried. A unit dies → its load is lost.
- If the fuel tanks are full, the hauler waits at the train holding the leftover load.
- Barricades cleared by hand and destroyed nests now leave **scrap piles to haul**, not instant scrap.
- The **crane car** is the exception: it lifts straight into the train, but only from deposits within 210 of that car, and only while stopped.

**Depot (between-level purchase, §9)**
- Each level has a **scrap budget**. You buy cars (max 8 including the locomotive) and order them. **Unspent budget becomes your starting scrap.**
- A suggested loadout is pre-filled. New purchases are added at the rear, but in front of a rear mine layer.

**Cars**
- Weapons:
  - Gun turret: 8 dmg / 0.45 s, range 240.
  - Cannon: 40 splash dmg / 2.2 s, range 90–380, ignores armour.
  - Flamer: 26 dps to every enemy within 130.
- Armour car: 300 HP, weight 2. The cars directly in front of and behind it take 35% less damage.
- Shield car: a 175-radius bubble with a 120-point pool that absorbs damage to anything inside (cars, crew, sentries). It recharges 14/s after 3 s without hits.
- Mine layer: works **only as the rear car**. Drops a mine every 150 px travelled (max 10). Mines blow up on contact for 50 splash damage.
- Workshop: while stopped, repairs itself or a neighbour at 6 HP/s, costing 1 scrap per 5 HP.
- Armoury: 2 sentry kits.
  - Press `B` with crew selected. The crew fetch a kit (from any car of the train), carry it out and take 2 s to build.
  - Sentry: 90 HP; gun 7 dmg / 0.4 s, range 200.
  - Crew can pack one up again (2 s) and carry the kit back. If you leave it behind, it's lost.
- Vehicle bays: deploy only while stopped. A crew member aboard becomes the driver; dock by ordering the vehicle onto the train.
  - If the vehicle is destroyed, its driver bails out alive.
  - If its bay is detached while the vehicle is out, it can't dock and is abandoned.
  - Docked vehicles are repaired from the bay's info panel.
  - Tank: 220 HP, armour 3, speed 64 (faster than the train), splash gun.
  - Excavator: 170 HP, speed 46.
- A disabled car (0 HP) loses its function, as before.

**Barricades**
- Reinforced barricades **can only be broken by a ram car at the front**. Anything else hits it once for 20 damage and stops dead. You can also dig one out by hand: the excavator does it 4× faster.
- **Changed:** a train with fuel can now ram a normal barricade **from a standstill**. Previously you could get stuck if you stopped right in front of one. Only a train crawling on an empty tank is too weak to break through.

**Enemies**

| Enemy | HP | Behaviour |
|---|---|---|
| Shooter | 30 | Ranged 130. |
| Rusher | 16 | Speed 115, explodes for 30. |
| Swarmer | 7 | Packs of 5–8, melee 2 dmg / 0.6 s. |
| Brute | 170 | Armour 4, slow, melee 22. Prefers cars. |
| Sniper | 24 | Range 340. Visible 1.6 s aim, then 22 damage. Prefers crew and vehicles. |
| Mortar | 40 | Range 160–480. Shell flies 1.7 s to a marked spot: 28 damage in radius 55. |

- Armour is a flat reduction per hit. Cannon shells, flames, mines and explosions ignore it.

**Unchanged from Milestones 1–2** (still provisional):
- Reorder: stopped-only, 1.5 s of shunting per swap.
- Salvage: 16 crew-seconds, train stopped within 300.
- Detach: rear car only, works while moving.
- Survivors: rescuing one adds a crew member.
- Middle-car destruction: the car is disabled, the train doesn't split.
- Repair: 10 scrap for +25 HP, while stopped.

## Balance notes (headless bot, `scripts/botrun.js`)

The bot only hauls with crew, repairs, digs out reinforced barricades and plans fuel ahead. It never builds sentries, drives vehicles, explores far or fights deliberately. A human player has far more tools.

| Level | Bot result | Notes |
|---|---|---|
| Green Valley | 4/4 wins, ~4 min | All crew survive. Ramming both barricades with the locomotive costs ~190 HP, which is the ram-car decision showing up. |
| Ash Flats | 4/4 wins, ~6 min | Often loses a crew member. Needs topping up before the barren middle. |
| Hive Line | 1/4 wins (another reached 99%) | Crew deaths and rear-car losses are the main failures. This is meant to require sentries, vehicles or a smarter train. |

Tuning changes made during balancing:
- Fuel deposits got bigger and more numerous.
- Swarmers do less damage (one pack used to delete a 90 HP car in 2 s).
- Hive Line's suggested train got a rear turret, and its budget rose to 260 to pay for it.
- Hive Line's escalation was softened slightly.

## Still open
- **Reorder, ram and salvage rules** (§14 Q2, Q3, Q8) are still only provisional.
- **Nest behaviour is a first guess** at how local activation and global escalation combine (Q4).
- **Not touched yet:**
  - damage consequences beyond "disabled" (Q5)
  - campaign structure and carrying the train between levels (Q10); levels are standalone, each with its own depot
  - theme (Q11)
