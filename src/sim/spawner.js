// Threat and spawning.
// Threat (0..max) is the single, visible measure of danger:
//  - while the train is exposed (stopped or crawling), it rises after a short grace period;
//  - while moving, it decays back toward the level's baseline.
// Spawn interval, group size and which enemy types can appear all scale with threat.
// Enemies appear out in the fog, a few hundred px from the train, and walk in.

import { isExposed, trainTail } from './train.js';
import { spawnEnemy } from './enemies.js';

export function threatFraction(state) {
  return state.threat / state.config.spawner.maxThreat;
}

export function spawnInterval(state) {
  const s = state.config.spawner;
  const f = threatFraction(state);
  return (s.intervalAtZero + (s.intervalAtMax - s.intervalAtZero) * f) * state.threatCfg.intervalMult;
}

// -1 easing, 0 steady, +1 rising
export function threatTrend(state) {
  const s = state.config.spawner;
  if (!state.started) return 0;
  if (isExposed(state)) {
    return state.stoppedTime > s.stopGrace && state.threat < s.maxThreat ? 1 : 0;
  }
  return state.threat > state.threatCfg.baseline ? -1 : 0;
}

export function updateThreat(state, dt) {
  const s = state.config.spawner;
  const baseline = state.threatCfg.baseline;
  if (!state.started) return;
  if (isExposed(state)) {
    state.stoppedTime += dt;
    if (state.stoppedTime > s.stopGrace) state.threat += s.risePerSecStopped * state.threatCfg.riseMult * dt;
  } else {
    state.stoppedTime = 0;
    if (state.threat > baseline) state.threat = Math.max(baseline, state.threat - s.decayPerSecMoving * dt);
  }
  state.threat = Math.min(s.maxThreat, state.threat);
}

export function updateSpawner(state, dt) {
  updateThreat(state, dt);
  const s = state.config.spawner;
  if (!state.started || !state.spawnsEnabled) return;
  if (state.train.head > state.world.length - s.noSpawnNearExit) return;

  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  spawnGroup(state);
  state.spawnTimer = spawnInterval(state) * (0.75 + state.rng() * 0.5);
}

function defaultTable() {
  return [
    { type: 'shooter', weight: 5, minThreat: 0, group: [1, 2] },
    { type: 'rusher', weight: 2, minThreat: 0, group: [1, 1] },
  ];
}

function pickEntry(state) {
  const table = (state.level.enemyTable ?? defaultTable()).filter((e) => e.minThreat <= state.threat);
  const total = table.reduce((n, e) => n + e.weight, 0);
  let r = state.rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return table[0];
}

export function spawnGroup(state, entry = pickEntry(state)) {
  const s = state.config.spawner;
  const rng = state.rng;
  const H = state.world.height;
  const trackY = state.world.trackY;
  const head = state.train.head;
  const tail = trainTail(state);
  const exposed = isExposed(state);
  const type = entry.type;

  const [gMin, gMax] = entry.group ?? [1, 1];
  let size = gMin + Math.floor(rng() * (gMax - gMin + 1));
  if (gMax <= 2) size += Math.floor(state.threat / s.groupSizeStep); // pack enemies already come in numbers

  // One anchor per group, members scattered around it.
  const side = rng() < 0.5 ? -1 : 1;
  const [dMin, dMax] = s.spawnDistance;
  const far = type === 'mortar' || type === 'sniper' ? 120 : 0;
  let x;
  let y = trackY + side * (dMin + far + rng() * (dMax - dMin));
  if (exposed) {
    x = tail - 300 + rng() * (head - tail + 600);
  } else if (type === 'rusher' || type === 'swarmer') {
    // Fast enemies chase a moving train from behind.
    x = tail - 350 - rng() * 250;
    y = trackY + side * (100 + rng() * 300);
  } else {
    // Slow ones wait ahead: a moving train drives past them.
    x = head + 300 + rng() * 500;
  }
  y = Math.max(20, Math.min(H - 20, y));
  for (let i = 0; i < size; i++) {
    spawnEnemy(state, type, x + (rng() - 0.5) * 60, Math.max(10, Math.min(H - 10, y + (rng() - 0.5) * 60)));
  }
}
