// Threat and spawning.
// Threat (0..max) is the single, visible measure of danger:
//  - while the train is exposed (stopped or crawling), it rises after a short grace period;
//  - while moving, it decays back toward a low baseline.
// Spawn interval, group size and rusher share all scale with threat.

import { isExposed, trainTail } from './train.js';
import { spawnEnemy } from './enemies.js';

export function threatFraction(state) {
  return state.threat / state.config.spawner.maxThreat;
}

export function spawnInterval(state) {
  const s = state.config.spawner;
  const f = threatFraction(state);
  return s.intervalAtZero + (s.intervalAtMax - s.intervalAtZero) * f;
}

// -1 easing, 0 steady, +1 rising
export function threatTrend(state) {
  const s = state.config.spawner;
  if (!state.started) return 0;
  if (isExposed(state)) {
    return state.stoppedTime > s.stopGrace && state.threat < s.maxThreat ? 1 : 0;
  }
  return state.threat > s.baselineThreat ? -1 : 0;
}

export function updateThreat(state, dt) {
  const s = state.config.spawner;
  if (!state.started) return;
  if (isExposed(state)) {
    state.stoppedTime += dt;
    if (state.stoppedTime > s.stopGrace) state.threat += s.risePerSecStopped * dt;
  } else {
    state.stoppedTime = 0;
    if (state.threat > s.baselineThreat) {
      state.threat = Math.max(s.baselineThreat, state.threat - s.decayPerSecMoving * dt);
    }
  }
  state.threat = Math.min(s.maxThreat, state.threat);
}

export function updateSpawner(state, dt) {
  updateThreat(state, dt);
  const s = state.config.spawner;
  if (!state.started || !state.spawnsEnabled) return;
  if (state.train.head > state.level.exitX - s.noSpawnNearExit) return;

  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  spawnGroup(state);
  state.spawnTimer = spawnInterval(state) * (0.75 + state.rng() * 0.5);
}

export function spawnGroup(state) {
  const s = state.config.spawner;
  const rng = state.rng;
  const H = state.config.world.height;
  const f = threatFraction(state);
  const size = 1 + Math.floor(state.threat / s.groupSizeStep);
  const rusherChance = s.rusherChanceMin + (s.rusherChanceMax - s.rusherChanceMin) * f;
  const head = state.train.head;
  const tail = trainTail(state);
  const exposed = isExposed(state);
  const fromTop = rng() < 0.5;

  for (let i = 0; i < size; i++) {
    const type = rng() < rusherChance ? 'rusher' : 'shooter';
    let x;
    let y = fromTop ? 0 : H;
    if (exposed) {
      // Anywhere around the stopped train.
      x = tail - 400 + rng() * (head - tail + 800);
    } else if (type === 'rusher') {
      // Rushers chase a moving train from behind.
      x = tail - 300 - rng() * 200;
      y = 40 + rng() * (H - 80);
    } else {
      // Shooters wait ahead; a moving train drives past them.
      x = head + 150 + rng() * 450;
    }
    spawnEnemy(state, type, x + (rng() - 0.5) * 40, y);
  }
}
