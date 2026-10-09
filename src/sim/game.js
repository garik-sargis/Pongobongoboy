// Simulation entry point: create a game and advance it by fixed time steps.

import { createState, updateTimers, pushMessage } from './state.js';
import { updateTrain, updateCarWeapons } from './train.js';
import { updateCrew } from './crew.js';
import { updateEnemies } from './enemies.js';
import { updateSpawner } from './spawner.js';
import { checkOutcome } from './rules.js';

export function createGame(config, level, seed) {
  return createState(config, level, seed);
}

export function step(state, dt) {
  if (state.outcome) return;
  state.time += dt;
  updateTrain(state, dt);
  updateCrew(state, dt);
  updateCarWeapons(state, dt);
  updateEnemies(state, dt);
  updateSpawner(state, dt);
  updateTimers(state, dt);
  if (checkOutcome(state)) state.train.running = false;
}

// --- Debug actions (testing only) ---

export function debugAddFuel(state) {
  state.fuel = Math.min(state.fuel + state.config.debug.fuelGrant, 9999);
  pushMessage(state, `[debug] +${state.config.debug.fuelGrant} fuel`);
}

export function debugDamageEngine(state) {
  const loco = state.train.cars.find((c) => c.type === 'locomotive');
  if (loco) loco.hp = Math.max(0, loco.hp - state.config.debug.engineDamage);
  pushMessage(state, `[debug] engine -${state.config.debug.engineDamage} HP`);
}

export function debugToggleSpawns(state) {
  state.spawnsEnabled = !state.spawnsEnabled;
  pushMessage(state, `[debug] spawns ${state.spawnsEnabled ? 'on' : 'off'}`);
}
