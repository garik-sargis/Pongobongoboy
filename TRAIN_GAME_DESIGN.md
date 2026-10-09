# Untitled Train Roguelike — Game Design Document

**Status:** Early concept / prototype handoff  
**Designers:** Two collaborators (the user and Dario)  
**Audience:** Claude Code or another implementation agent  
**Last discussed:** October 8, 2026  
**Purpose:** Capture the design conversation accurately and turn it into a practical first playable prototype without pretending that unresolved ideas have been decided.

> **Important implementation instruction:** This document distinguishes **Agreed direction**, **Prototype recommendation**, **Explored possibility**, and **Open question**. Do not silently convert an explored possibility into a required feature. Build a small playable slice first. If something is unspecified, prefer a simple, configurable implementation and record the assumption.

---

## 1. High-level concept

A **single-player, real-time, train-based survival/strategy roguelike** in which the player's train is a **modular, mobile base** traveling from left to right along a railway. The player manages limited fuel, a small crew, combat, salvaging, and the composition and order of train cars.

The defining tension is:

- **Moving** consumes fuel and may involve attacks and hazards, but is generally safer than lingering.
- **Stopping** allows the player to gather essential resources, deploy crew and machinery, repair, salvage new cars, reorganize the train, and deal with obstacles—but exposes the train to increasingly serious attacks.
- Sometimes the player can **pay a cost to keep moving** (e.g., ram through an obstruction and take damage) rather than stop to deal with it safely or efficiently.

The aim is **not** to make an endless score-chasing survival game where pressure only grows monotonically. The full vision is a journey with **distinct regions, meaningful choices, preparation periods, dangerous crossings, and relief after surviving a difficult section**.

### Short pitch

**Keep a modular train alive long enough to reach the end of a hostile railway. Decide when to stop for fuel, resources, and upgrades; defend vulnerable work crews; and continually reconfigure your train to survive the next threat.**

### Inspirations discussed (not design requirements)

- **Slay the Spire:** consequential branching route choices; fights versus safer or utility opportunities.
- **FTL:** choosing connected destinations while a pursuing threat limits lingering or backtracking.
- **Unrailed!:** continuous train-centered play and track/resource pressure, though the designers want more meaningful trade-offs and less repetitive progression.
- **Frostpunk:** preparing during easier periods for a known impending dangerous stretch.
- **Trackline Express:** train journey and a possible pressure chasing from behind.
- **Bad North / Thronefall-like accessible strategy:** move or position units, with combat handled automatically instead of requiring heavy RTS micro.

These are reference points for mechanics and pacing, **not** a request to copy their visual styles or systems.

---

## 2. Design pillars — agreed direction

1. **The train is the player’s base, and its physical configuration matters.** Cars have distinct functions; their ordering can create strengths, weaknesses, and new options.
2. **A meaningful stop-versus-move decision.** Fuel forces periodic stops, but valuable optional stops should also be tempting. Staying too long becomes unsafe.
3. **Crew are versatile but inefficient without equipment.** Humans can fight, gather, and clear things themselves; specialized tools and vehicles let the same limited crew accomplish more.
4. **Simple, readable real-time combat.** Player controls movement/positioning; units and turrets auto-attack valid targets. No elaborate target-clicking or manual ammunition system in the initial prototype.
5. **Dynamic pacing rather than nonstop horde combat.** Low-pressure preparations can precede resource-poor, hostile zones. The eventual roguelike structure provides branching strategic decisions.
6. **Make the core loop fun before expanding complexity.** The designers explicitly rejected adding a second, more elaborate commander/fog-of-war game and colony-style management right now.

---

## 3. Decisions and confidence levels

### Agreed direction / explicit choices

| Topic | Current decision |
|---|---|
| Genre | Real-time strategy/survival with **roguelike structure** as the working direction. |
| Immediate target | **One playable level** rather than an entire campaign. |
| Level objective | Reach the **rightmost end of the area/biome** with the train; an exit tunnel is one suggested visual. |
| Game over | **Locomotive destroyed** OR **all crew members dead**. |
| Train | Modular cars; can add, remove, reorder, and specialize them. |
| Typical train size | Aim for roughly **4–10 cars** during normal play; not a hard-coded minimum or maximum yet. |
| Resources | **Fuel** for travel and **scrap** for repairs/building/upgrades; **crew count** is also a scarce resource. |
| Fuel cost | More cars should generally mean greater fuel usage, creating a cost for a longer train. |
| Stopping | Enables gathering, work, deployment, and reorganization; makes the player more vulnerable. |
| Crew | Generalists who can fight and perform manual work, with specialist machinery increasing efficiency. |
| Combat | Real-time, mostly ranged, health-based; **manual movement orders + automatic attacks**. |
| Enemies | Hostiles can attack while the train is moving; sustained stops should bring escalating pressure. |
| Initial scope exclusions | No food/colonist needs; no standard-ammo economy in the first version; no physically walking commander with limited train visibility. |
| Visual theme | **Undecided.** Gameplay should not depend on humans vs. robots vs. monsters or steam vs. futuristic settings. |

### Working assumptions to test, not final decisions

- Traveling is **safer on average**, not completely safe; attackers may approach a moving train.
- The player may sometimes be able to **break through an obstacle by taking damage**, but other obstructions require specific equipment or stopping.
- Stopping causes danger to **increase over time**; gathering or exploring away from the train may further activate threats.
- Changing the order of cars is likely a **stopped-train action**; emergency dropping of cars could be possible while moving.
- Train cars may have individual HP, and the train may suffer consequences if a middle car is destroyed. Exact consequences are undecided.
- A crew member operating a vehicle or specialist machine is temporarily unavailable for other jobs.

---

## 4. Core gameplay loop

### Moment to moment

1. **Travel right along the track.** The engine burns fuel. The player sees upcoming obstacles, resources, survivors, salvaged equipment, and attacks.
2. **Evaluate an opportunity or problem.** Stop to gather or salvage? Keep going and conserve time? Risk ramming an obstruction? Prepare before the next difficult stretch?
3. **Stop and give orders if worthwhile or necessary.** Crew can leave the train, gather fuel/scrap, fight, clear the track, and potentially operate machinery. Player may rearrange cars or repair damage while stationary.
4. **Defend the train and crew.** Turrets and troops automatically engage enemies. The player directs positions and assigns jobs. Enemy pressure grows during a prolonged stop.
5. **Leave before the situation becomes unmanageable.** Recover crew and valuable deployables when possible; accept that there may be a reason to abandon cheap equipment or even a train car to survive.
6. **Adapt the train.** Adding stronger equipment enables new options but increases fuel consumption and exposes more carriages to damage.
7. **Reach the end of the level** while keeping the locomotive and at least one crew member alive.

### Intended emotional rhythm

**Preparation → temptation / opportunity → dangerous stop → escape / movement → hostile crossing → reprieve.** Avoid making every second a maximum-pressure fight.

### Example encounter: barricade and scrap

A barricade appears on the track. The train has enough health that **ramming** it might be acceptable, but the locomotive is already damaged. A damaged ramming car could be salvaged nearby, or an existing ramming car could be moved to the front while stopped. The player stops, assigns a worker to collect scrap, and rearranges cars. Enemies begin to arrive, then increase in frequency. The player stops gathering before the node is exhausted, recalls the crew, and pushes through the obstacle with the ramming car taking the hit.

This is an **illustrative encounter**, not a finalized sequence of mandatory mechanics.

---

## 5. Train system

### 5.1 Composition and layout

- Train travels primarily **left to right**, following a track. The railway constrains movement; this is not a freely steering vehicle.
- A **locomotive/engine car** powers the train and is a critical-loss unit. It **need not always be the foremost car**; a ram or drill can lead, with the engine behind it.
- Cars attach in a **linear ordered sequence**. The ordering has tactical consequences.
- The train should be comprehensible at approximately **4–10 cars**. The designers discussed ~20 cars but considered that too unwieldy, at least for this version.
- **Added cars have a real cost**—at minimum increased fuel use. This makes “take every car” a poor default strategy.
- Adding, removing, and reordering cars are important eventual mechanics; consider showing reconfiguration in a clear interface rather than simulating real-world rail shunting.

### 5.2 Position-based effects

Possible examples discussed:

- **Ramming/drill car:** best or only effective when placed at the **front**; helps break through obstructions.
- **Rear defense car / guns / mine layer:** useful when enemies attack from behind.
- **Turret car:** defensive power against enemies within weapon range; coverage or effectiveness might vary with position.
- **Fuel/storage car:** expands fuel capacity but also increases weight/consumption.
- **Crane car:** quickly handles nearby salvage or materials, but only within its limited reach.
- **Vehicle bay / utility car:** carries a tank, mech, excavator, or mobile sentry that can be deployed during a stop.
- **Crew/passenger car:** holds or supports additional crew (exact necessity unconfirmed).

**Important:** These are a menu of interesting car designs, **not** a confirmed day-one roster. Cars like healing stations, repair specialists, and medical cars were mentioned as possible directions, but no full healing system was settled.

### 5.3 Train reconfiguration and sacrifice

- The designers like the idea of **stopping to reorder cars** to meet an upcoming problem, with enemy attacks continuing while they do so.
- An emergency action to **drop a trailing car (or potentially another selected segment) while moving** was viewed as fun. It could save fuel, escape danger, or sacrifice a damaged component.
- A **middle car being destroyed** might split/detach cars behind it. This was an evocative risk but is **unconfirmed**. Do not build complex coupling physics into the first prototype.
- To keep tactical choices meaningful, some functions should be **position-dependent**, rather than every configuration being equally good.

### 5.4 Damage and repair

- Cars and crew have health; enemies can target them.
- **Locomotive HP = key failure condition.**
- **Scrap** is the intended repair/build/upgrade material.
- Exact repair mechanics, part HP, crew healing, and whether locomotives can be repaired in motion are not decided. For the prototype, make repair possible while stopped using scrap, if repair is implemented at all.

---

## 6. Resources and economy

### Fuel — critical movement resource

- Fuel is consumed when moving the train.
- If fuel runs out, the train cannot continue until refueled (subject to preventing unfair softlocks; see design risks).
- Fuel pickups or deposits are key reasons to stop. Crew may gather at a resource site near the rails.
- Extra cars should increase movement fuel cost. The exact curve is to be tuned; begin with a transparent, configurable formula rather than hidden realism.
- Fuel storage capacity may be affected by fuel tank cars.
- A planned resource-poor zone could encourage the player to stock up in advance.

### Scrap — construction and recovery resource

- Obtained by salvaging material, wrecks, or resource deposits.
- Spent on repairing damage and eventually building/upgrading cars or machinery.
- Collection exposes crew and train to attack.

### Crew — people as a strategic resource

- Each living person can perform useful tasks or operate equipment.
- Crew may die in combat, reducing economic and combat capacity.
- **Rescuing survivors** is a potential reason to risk a stop; survivors can join the crew.
- All crew lost means game over, even if the locomotive remains intact.
- Crew do **not** require food, morale, beds, or colony-style upkeep for the first version.

### Explicitly deferred resource systems

- **Ordinary ammo:** discussed, but postponed to keep the first version simple. Large/special weapons might eventually use consumable ammunition.
- Food, population needs, elaborate crafting chains, and numerous resource types were **not** accepted for the prototype.

---

## 7. Crew, controls, and specialized tools

### General crew behavior

A crew member is a **generalist** capable of:

- Basic ranged combat (a generic gun/shotgun is fine initially).
- Collecting fuel and scrap manually.
- Clearing or interacting with rail obstacles.
- Performing simple work such as repair, rescue, and possibly reattachment/reconfiguration.

The underlying idea is **one set of versatile humans, more effective when supported by machinery**, not a complex class/skill tree.

### Player input and automation

- **Manual orders:** select a crew member or mobile unit and tell it where to go / what nearby resource or object to interact with.
- **Automatic fighting:** when enemies enter range, a unit with a weapon automatically chooses and attacks a valid target. Mounted train turrets do the same.
- Prefer simple interactions to click-select enemy, click-gun, click-fire sequences.
- Optional future convenience orders: patrol, guard, retreat, or an automatic work assignment. None is required initially.

### Vehicles and machines — explored and liked

- **Tank or combat mech:** a crew member boards/drives it, allowing stronger combat and movement away from the rails. The operator cannot also gather while driving.
- **Excavator/gathering mech:** dramatically faster resource collection than a human with hand tools.
- **Crane mounted on a car:** faster collection/salvage immediately alongside the train, with limited reach.
- **Mobile deployable sentry:** crew deliver a device away from the train and unfold it into a strong, stationary defensive position. The player later chooses whether to recover it or abandon it when retreating.
- **Small fast vehicle alongside the moving train:** possible later for scouting, combat, or collecting near the railway while in motion.

These are promising **subsequent milestones**, not all essential to validate the initial core loop.

---

## 8. Combat and threats

### Agreed simple combat model

- Real-time and predominantly **ranged** at first.
- Enemies, crew, vehicles, and destructible cars have HP.
- Combat-capable player units and turrets **auto-attack**; player decides where mobile units move.
- Enemy AI can be simple: move toward a target, enter range, attack. Different enemy types can prioritize different targets.
- The player fights while traveling and while stopped; stopping is distinctly more dangerous over time.

### Enemy behavior and pressure

The designers discussed combining two systems:

1. **Background pressure / movement encounters.** Enemies sometimes approach or attack the traveling train at a **lower frequency** than during prolonged stops.
2. **Stationary escalation.** While stopped, enemy attacks **grow in frequency or intensity** so the player cannot profitably camp indefinitely behind perfect turrets.

A second compatible idea was **local activation**: moving crew into a hostile place or making noise by extracting resources awakens/attracts enemies. This gives gathering sites distinct risk profiles. Exact spawning rules are still open, so do not lock into one explanation for all enemy appearances.

Enemies can approach from the top/bottom of the playable space, from terrain, from hostile areas, or from behind the train. The battlefield was imagined as a relatively **long horizontal rectangle**, with enemies coming from either side of the railway.

### Enemy archetypes to explore

- **Basic ranged attacker:** approaches and shoots crew or cars.
- **Fast suicide attacker:** runs toward the train and deals major contact/explosion damage; intended to create a brief **“kill that one immediately”** moment (inspired by the charging Uruk-hai in *The Two Towers* / Helm's Deep).
- **Tough or dangerous variant:** higher health, damage, range, or an equipment-focused attack.
- **Rear pursuer / flanker:** encourages rear-defense choices.

For the first playable, one basic attacker and one conspicuous high-priority attacker are enough.

### Combat pacing constraints

- The game should **not** be an uninterrupted automatic kill-fest.
- Dangerous moments should arise from **trade-offs**, urgency, and positioning, not just constantly more enemies.
- Make escalating pressure legible so players understand why they must leave a stop.

---

## 9. World, progression, and roguelike structure

### Prototype: one area, one finish line

- Build **one contiguous level/biome**.
- The train starts toward the left and wins by reaching the **right edge / exit tunnel**.
- A small number of resource stops, combat moments, and rail obstacles is sufficient.
- Do not implement an overworld node map merely to satisfy the label “roguelike.” The designers explicitly wanted to settle the first playable level first.

### Longer-term direction: a branching journey

- After a stretch or level, the player chooses a route or next area based on **partial advance information** (e.g., more resources but heavy fighting, or an easier but barren route).
- Distinct zones create rhythm: **resource-rich preparation section → dangerous resource-poor region → relative safety / repairs → another leg**.
- Choices should have meaningful risk/reward, similar to FTL or Slay the Spire in structure but embodied as a traveling train.
- A pursuing hazard from the left could discourage stalling; this was considered but **not committed** and may be unnecessary if stop escalation already creates sufficient pressure.
- A between-level station for buying/rearranging/upgrading cars is possible but **not yet designed**.
- Whether all run progression is fully discrete levels, seamless segments, or a hybrid remains open. Current practical compromise: a playable continuous level with a future campaign map.

### Potential future track mechanics

- Rail junctions with meaningful route information, so branching is **informed**, not random.
- Destroyed/missing track or obstacles might require **clearing or building rail**.
- These ideas came up but are **not required for the initial slice**.

---

## 10. Recommended first playable prototype (implementation proposal)

**This section makes minimal recommendations to turn the agreed ideas into code. It is not a record of finalized design votes.** Prioritize a *playable test of the core tension* over polish and content volume.

### 10.1 Prototype experience

A 5–15-minute test run on one horizontal map. The player begins with a locomotive, a few cars, and a small crew. They need to reach the far-right exit. The train has limited fuel, so they must stop at least once, send crew to collect fuel, and withstand increasing hostile attacks. One obstruction creates a **ram / clear / reorganize** decision. Scrap permits some repair, and one optional reward tempts a longer stop.

### 10.2 Suggested starting content

| Category | Suggested minimum |
|---|---|
| World | One side-scrolling/horizontal level with an exit tunnel or endpoint. |
| Train | Locomotive + turret car + fuel/storage car (start around 3; grow toward the agreed 4–10 scale). |
| Optional fourth car | Ram/drill car available at start or as a clearly obtainable piece, to test placement. |
| Crew | Two generalist crew members with manual move/interact commands and auto-attack. |
| Resources | Fuel deposits + scrap deposits; visible counters. |
| Work | Refuel, collect scrap, and optionally repair while stopped. |
| Enemies | One ordinary shooter + one fast high-priority threat. |
| Train combat | Turret automatically attacks enemies in range. |
| Pressure | Moving: light encounters. Stopped: spawning escalates with stationary duration. |
| Obstacles | At least one barricade that can be cleared or overcome through a deliberate cost/tool choice. |
| Reconfiguration | A basic stopped-only car reorder operation; at least one meaningful front-position effect. |
| Completion | Reach far-right boundary with engine intact and at least one crew alive. |
| Defeat | Engine HP reaches 0 OR crew count reaches 0. |

**Scope note:** If this is too much for a single coding pass, build it in the phases below. A prototype without a fully developed salvage system is acceptable; one without a meaningful fuel/stop/combat loop is not.

### 10.3 Suggested build sequence

**Phase 1 — Movement, economy, and win/loss**

- Draw a simple railway, a locomotive with attached cars, and the exit.
- Allow start/stop movement and consume fuel in motion.
- Display fuel, engine HP, crew count, and progress.
- Implement win at the right edge, lose on engine destruction / all crew dead.
- Provide temporary debug actions for testing fuel and damage.

**Phase 2 — Stop/work/combat loop**

- Add crew selection, move orders, simple interaction with nearby fuel/scrap nodes.
- Add auto-attack for a crew member and a turret car.
- Spawn mobile enemies with HP and target selection.
- Escalate pressure while stopped; reduce it during movement.
- Verify that collecting fuel is useful yet risky and movement gives relief.

**Phase 3 — Distinctive train choices**

- Give cars individual HP and implement a simple car list/reordering UI.
- Add a ram/drill/front-position bonus and a barricade decision.
- Make car count affect fuel burn; allow discarding a car.
- Add scrap-based repairs and an optional survivor or car-salvage reward.

**Phase 4 — Add only if Phase 3 is compelling**

- A crew-operated tank or excavator (choose **one** first).
- A deployable stationary sentry with recover/abandon trade-off.
- More varied encounters, a second zone, and then a branching route map.

### 10.4 Camera and art for the prototype

- **2D, horizontal layout** is an appropriate starting assumption because the train travels left to right and threats approach above/below the tracks.
- Exact side-on versus top-down/isometric projection **was not chosen**. Pick the easiest readable placeholder view, keep implementation decoupled from art, and confirm before major art investment.
- Use color-coded primitive shapes or temporary icons for cars, units, resources, and enemies. A specific theme was not chosen.
- The brainstormed **physical commander who walks through the cars to reveal them** was deliberately shelved as too much extra complexity.

### 10.5 Keep tuning parameters data-driven

Expose and label constants such as:

- Base fuel consumed per traveled unit / second.
- Additional fuel cost per attached car.
- Fuel capacity and deposit yield.
- Manual gathering speed (and later machine gathering multipliers).
- Enemy movement speed, attack ranges, damage, and health.
- Base spawn interval during travel, initial interval during a stop, and escalation over stopped time.
- Amount of damage from a barricade collision, and ram-car damage reduction.
- Car and crew starting HP; scrap cost per repair point.

Do **not** treat arbitrary initial values as final design decisions.

---

## 11. Suggested interaction / UX contract

The exact controls depend on the engine and platform, but these affordances should be obvious:

- A **Move / Stop** control for the train; clear indication when fuel is being consumed.
- Select one crew member or mobile unit; **click a destination** to move, or click an object to work/interact.
- Turrets and combat units visibly acquire targets and fire **without individual attack commands**.
- Clicking a car shows its role, HP, and position-dependent effects.
- While stopped, a simple UI allows **reordering cars**; disallow or defer complex reordering in motion.
- Clear display of **fuel, scrap, crew alive, engine HP, distance to exit, and whether danger is escalating**.
- Obvious warnings for low fuel, a threatened/damaged locomotive, crews still outside, and an approaching attack.
- A clear end-of-level success state and both defeat explanations.

The interface must allow a player to understand **why a stop is worth taking**, **why it becomes unsafe**, and **what they sacrifice by bringing extra cars**.

---

## 12. Critical design risks / things to evaluate

### Is stopping actually a choice?

If fuel pickups only occur at mandatory stops, the player may feel forced to wait rather than weigh options. Offer enough fuel margin, optional scrap/survivors, competing sites, and occasional alternatives (such as paying damage to pass) to create genuine decisions.

### Can a player safely camp forever?

If turrets eliminate every attacker for free, there is no reason to leave. Escalation while stopped must eventually challenge the current defense without making the earliest seconds unfair.

### Does failure feel earned?

The player should get warning before a stop becomes deadly. A surprise unstoppable swarm or unseen one-shot against the locomotive is not a good version of pressure.

### Can fuel cause a softlock?

If fuel reaches zero and all reachable fuel has been depleted or missed, what happens? The team has not chosen a rule. The prototype should either guarantee reachable emergency fuel, allow a costly recovery mechanic, or make the resulting loss explicit rather than trapping the player indefinitely.

### Is a longer train always superior or always inferior?

Added cars bring functional value but consume more fuel. Tune so that keeping a damaged or niche car, taking a new car, and abandoning a car can each make sense in some contexts.

### Is rearrangement interesting or just busywork?

Reordering should answer visible threats and create trade-offs. If one layout is optimal everywhere, position dependence is not doing its job. If every small obstacle forces the same rearrangement animation, it becomes tedious.

### Does controlling crew create too much micro?

The desired experience is **movement and work assignments + automatic combat**, not frantic unit-by-unit firing. Prefer few crew and simple orders over a large RTS army.

### Are escalating spawns and local activation compatible?

They can coexist, but the game needs readable cues for the danger of **being stationary**, **working at noisy sites**, and **entering hostile territory**, rather than opaque random spawns.

---

## 13. Out-of-scope and explicitly parked ideas

These were brought up and are worth preserving, but **do not implement them as required MVP mechanics**:

- Fully fledged FTL/Slay-the-Spire-style campaign map and multiple biomes.
- A chasing fire/fog/enemy wall from the left.
- Full missing-track construction and track-laying systems.
- Walking commander avatar and train-car-by-train-car visibility/fog of war.
- 20-car trains and detailed realistic shunting/coupling/physics.
- Colony, hunger, morale, food, or housing management.
- Ordinary bullet/ammo economy; individually commanded firing.
- Complex crew classes, skill trees, or sophisticated job scheduling.
- Large inventory of combat vehicles, gathering machines, cranes, deployables, and special weapons **all at once**.
- Persistent bases, elaborate tech trees, deep crafting, or story systems.

Possible long-term themes mentioned: **steam-era locomotive, fantasy/magic, futuristic robots, humans, monsters, bugs, or zombies**. Nothing was chosen.

---

## 14. Outstanding questions for the designers (not blockers for a gray-box prototype)

1. **Camera/projection:** True side view, top-down, or 2.5D/isometric? Which best communicates crews working beside the tracks and enemies above/below?
2. **Track obstruction rule:** Can a locomotive ram weak barriers by losing HP, while reinforced barriers require a ram/drill/clearing crew? Or is ramming always a specialized action?
3. **Reconfiguration cost:** Instant reordering while stopped, or time/crew/scrap required? Which makes the danger of reordering feel worthwhile without being tedious?
4. **Threat escalation:** Strictly based on stationary time, driven by noise/activity, or a combination?
5. **Damage consequences:** What happens when a non-engine car reaches zero HP? Disabled function, destruction, falling off, or severing the train?
6. **Crew task behavior:** Are human workers allowed to auto-defend themselves while gathering, and does combat interrupt work?
7. **Fuel softlock rule:** Emergency collection, alternate costly movement, or clear terminal loss?
8. **Salvage rules:** Does acquiring a whole train car require a crane, several crew, enough scrap, or merely time at a stopping point?
9. **How much information is visible ahead?** Enough to make stop/ram/route decisions without surprise punishment; exact view distance undecided.
10. **Later campaign structure:** Discrete encounters/levels, continuous traversal, or a mix? Where do purchase/upgrade decisions occur?
11. **Theme/art direction:** Select only after the gray-box prototype tests the core mechanics, unless strong theme ideas help guide enemy readability.

---

## 15. Playtest scenarios and acceptance criteria

Use these as **observable proof** of a working prototype rather than treating code completion alone as success.

| Scenario | Expected observable result |
|---|---|
| Drive toward the exit | Train visibly advances right, fuel declines, and distance to exit decreases. |
| Stop at a fuel deposit | Player can send crew to gather fuel and make movement possible or more sustainable. |
| Stay stopped too long | Enemy pressure visibly increases, creating a reason to depart. |
| Fight while stopped | Turret and crew automatically fire on enemies in range; player can reposition crew manually. |
| Fight while moving | Some attacks still occur, but the situation is generally easier than camping. |
| Add a car | Its function is usable and fuel consumption increases accordingly. |
| Put a ramming car in front | A relevant barricade becomes cheaper or possible to break through; layout choice is meaningful. |
| Abandon/detach a car | Train loses its function but becomes lighter/cheaper to run; if supported, the interaction is clear. |
| Destroy locomotive | Run ends in defeat with an explicit reason. |
| Kill all crew | Run ends in defeat even if locomotive survives. |
| Reach final tunnel | Run ends in victory with an explicit reason. |

**Core design success test:** At least once per playtest, the player should face a real decision along the lines of: *“Do I leave now with enough fuel, or stay longer to get scrap / rescue someone / improve the train even though things are becoming dangerous?”* A second good sign is a car-reordering decision that clearly changes how a specific encounter plays.

---

## 16. Notes to Claude Code — implementation handoff

**Primary assignment:** Build an enjoyable **gray-box vertical slice**, not the entire imagined roguelike.

1. **First inspect the repository** and its existing tech stack, structure, conventions, and playable entry point. Do not assume a particular engine (Unity, Godot, web, etc.) from this document.
2. If starting from a blank repository, propose a **simple technology choice** appropriate for a fast playable prototype and make clear why. Avoid complicated dependencies or systems architecture.
3. Implement **Phase 1**, then **Phase 2**, then the most valuable parts of **Phase 3**. Keep the build playable after each phase.
4. Keep systems modular: `Train/Car`, `Crew/Unit`, `ResourceNode`, `Enemy`, `Encounter/Spawner`, `Level/WinLoss`, and user controls. This is a conceptual division, not required class names.
5. Expose numbers in editable config/constants. Use cheap placeholder art, clear feedback, and simple deterministic examples for testing.
6. Preserve the distinction between **agreed** and **proposed** behavior. For details necessary to proceed, select straightforward defaults, list them in a brief `ASSUMPTIONS.md` or project README, and let the designers revise them.
7. Surface real design uncertainties when they materially alter architecture or the fun of the game; do **not** invent complex answers to questions the designers intentionally left open.
8. At the end of each milestone, report **what can be played**, **what is mocked/deferred**, **how to launch it**, and **which user decisions would be most valuable next**.

### Suggested first milestone request

> Build a minimal playable horizontal train level. I can start/stop a locomotive and watch fuel drain while moving. I can select two crew members, send them to collect fuel, and defend against simple auto-attacking enemies. Enemy attacks escalate while the train stays stopped. I win by reaching the right edge and lose if the locomotive is destroyed or every crew member dies. Use placeholders and configurable tuning constants; record assumptions instead of inventing larger systems.

Once that works and feels understandable, the **next priority** is the unusual thing that could make this game its own: **modular cars with position-dependent effects, costly stops, and difficult decisions about whether to keep, reorder, salvage, or abandon parts of the train.**
