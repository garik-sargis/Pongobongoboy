// Simulation entry point: create a game and advance it by fixed time steps.

import { createState, updateTimers, pushMessage } from './state.js';
import { updateTrain } from './train.js';
import { updateUnits } from './units.js';
import { updateCarWeapons, updateSentries, updateMines } from './weapons.js';
import { updateCarModules } from './defense.js';
import { updateEnemies, updateNests } from './enemies.js';
import { updateSpawner } from './spawner.js';
import { updateFog } from './fog.js';
import { checkOutcome } from './rules.js';

// opts: { seed, loadout, scrap }
export function createGame(config, level, opts = {}) {
  const state = createState(config, level, typeof opts === 'number' ? { seed: opts } : opts);
  updateFog(state, 1);
  return state;
}

export function step(state, dt) {
  if (state.outcome) return;
  state.time += dt;
  updateTrain(state, dt);
  updateCarModules(state, dt);
  updateUnits(state, dt);
  updateCarWeapons(state, dt);
  updateSentries(state, dt);
  updateMines(state, dt);
  updateEnemies(state, dt);
  updateNests(state, dt);
  updateSpawner(state, dt);
  updateFog(state, dt);
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

export function debugToggleFog(state) {
  state.fog.enabled = !state.fog.enabled;
  pushMessage(state, `[debug] fog ${state.fog.enabled ? 'on' : 'off'}`);
}
