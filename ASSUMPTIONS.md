# Assumptions & defaults (Milestone 1)

Everything here is a placeholder chosen to make the prototype playable. None of it is a design
decision; change freely. Numbers live in `src/config.js`.

## Confirmed by the designers for this milestone

| Topic | Choice |
|---|---|
| Platform | Desktop browser, mouse + keyboard. |
| Crew outside when the train departs (§14 / UX) | The train **leaves them behind**. They are slower than the train and can only re-board if it stops (or crawls) close enough. A warning shows while crew are outside a moving train. |
| Fuel softlock (§14 Q7) | At 0 fuel the train **crawls** at 15% speed. Crawling counts as "stopped" for threat, so it's survivable but punishing. |
| Crew working under fire (§14 Q6) | Workers **pause gathering while an enemy is in range** and shoot back (`crew.pauseGatherWhenFighting`). |

## Defaults picked by the implementer

**Presentation**
- Top-down 2D gray-box. Track runs horizontally through a 600-unit-tall band; enemies come from the top/bottom edges and from behind.
- Camera follows the train with the front at 55% of the screen; player can pan freely. A route bar shows all deposits for the whole level (full information ahead, §14 Q9).

**Train**
- Car order is fixed this milestone (front → back: locomotive, turret, fuel tank). Reordering is Milestone 2.
- Fuel is burned per distance travelled, not per second, so a stopped train burns nothing.
- Every car has HP. A non-engine car at 0 HP is **disabled**: stays attached, stops working (turret stops firing; fuel tank's capacity is lost, and fuel above the remaining capacity spills). Repairing above 0 restores it. No splitting/detaching (§14 Q5 still open).
- Repair: select a car, spend 10 scrap for +25 HP. Instant, only while stopped, no crew required.

**Crew**
- Crew aboard are safe and do not fight. Only the turret defends a moving train.
- Crew can only leave the train while it is stopped; they step off on the side facing their destination.
- Gathered fuel/scrap goes straight into stock (no carrying back to the train).
- Fuel gathering stops when tanks are full.

**Threat & spawning** (§14 Q4: time-based only for now; no noise/local activation yet)
- Nothing spawns until the train first departs (so the player can read the help and plan).
- Threat drifts to a low baseline while moving; while stopped or crawling it rises after a 3 s grace.
- Spawn interval, group size and rusher chance all scale with threat.
- Moving: shooters spawn ahead (the train drives past them), rushers come from behind and can catch up.
- Stopped: enemies come from the top/bottom edges anywhere around the train.
- Enemies target whatever is nearest: crew outside or any car with HP left.
- No spawns in the last 400 px before the exit.

**Win / loss**
- Win when the front of the train reaches the tunnel with at least one living crew member **aboard**. Crew left outside are reported as left behind.
- Arriving with nobody aboard is a loss.

## Tuning notes from headless checks

- A naive bot that stops at every near-track deposit and leaves when threat hits 60 wins in about 4 minutes, with the locomotive at 80–95% HP. This is probably too easy for a careful player; tune after the first human playtests.
- Camping in one spot is safe for about 30 s and becomes fatal at about 55–60 s.
- Driving straight through on starting fuel gets about 450 m of the 1160 m route (enforced by a test).

## Open questions this milestone did not need to answer

Reconfiguration cost (§14 Q3), barricade/ram rules (Q2), salvage rules (Q8), campaign structure (Q10), theme (Q11).
