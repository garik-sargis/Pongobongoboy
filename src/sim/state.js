// Game state construction and small shared helpers.
// The simulation is plain data + functions with no DOM or canvas access,
// so it can run headless in tests.

import { createRng } from './rng.js';

export function createState(config, level, seed = level.seed) {
  let nextId = 1;
  const state = {
    config,
    level,
    rng: createRng(seed),
    newId: () => nextId++,
    time: 0,
    started: false,          // spawner stays idle until the train first departs
    train: { head: level.startX, speed: 0, running: false, cars: [], distance: 0, shunting: 0, blockedBy: null },
    fuel: config.train.startFuel,
    scrap: 0,
    crew: [],
    nodes: [],
    wrecks: [],
    barricades: [],
    survivors: [],
    enemies: [],
    threat: config.spawner.baselineThreat,
    stoppedTime: 0,
    spawnTimer: config.spawner.firstSpawnDelay,
    spawnsEnabled: true,
    effects: [],
    messages: [],
    stats: { kills: 0, fuelGathered: 0, scrapGathered: 0, rescued: 0, salvaged: 0, barricadesRammed: 0, barricadesCleared: 0 },
    outcome: null,
  };

  state.train.cars = config.train.startCars.map((type) => makeCar(state, type));
  for (const name of config.crew.names) {
    state.crew.push(makeCrewMember(state, name, level.startX, config.world.trackY, config.crew.hp, true));
  }
  state.nodes = level.nodes.map((n) => ({
    id: state.newId(),
    kind: n.kind,
    x: n.x,
    y: n.y,
    amount: n.amount,
    max: n.amount,
    radius: 14 + Math.sqrt(n.amount) * 2,
  }));
  for (const w of level.wrecks ?? []) {
    makeWreck(state, w.carType, w.x, w.y, Math.round(config.cars[w.carType].hp * w.hpFraction), config.salvage.work);
  }
  state.barricades = (level.barricades ?? []).map((b) => ({
    id: state.newId(),
    x: b.x,
    y: config.world.trackY,
    strength: b.strength,
    work: 0,
    workNeeded: b.strength * config.barricade.clearWorkPerStrength,
    broken: false,
    radius: 24,
  }));
  state.survivors = (level.survivors ?? []).map((s) => ({
    id: state.newId(), name: s.name, x: s.x, y: s.y, rescued: false, radius: 10,
  }));
  return state;
}

export function makeCar(state, type, hp = state.config.cars[type].hp) {
  const def = state.config.cars[type];
  return { id: state.newId(), type, hp, maxHp: def.hp, cooldown: 0 };
}

export function makeWreck(state, carType, x, y, hp, workNeeded) {
  const w = { id: state.newId(), carType, x, y, hp, work: 0, workNeeded, done: false, radius: 30 };
  state.wrecks.push(w);
  return w;
}

export function makeCrewMember(state, name, x, y, hp, aboard) {
  const member = {
    id: state.newId(),
    name,
    hp,
    maxHp: hp,
    x,
    y,
    aboard,
    alive: true,
    order: null,
    cooldown: 0,
    fighting: false,
    working: false,
    blocked: null,
  };
  return member;
}

export function pushMessage(state, text, tone = 'info') {
  // Avoid stacking identical messages.
  const existing = state.messages.find((m) => m.text === text);
  if (existing) {
    existing.ttl = 3;
    return;
  }
  state.messages.push({ text, tone, ttl: 3 });
  if (state.messages.length > 5) state.messages.shift();
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function moveToward(unit, tx, ty, maxStep) {
  const d = dist(unit.x, unit.y, tx, ty);
  if (d <= maxStep || d === 0) {
    unit.x = tx;
    unit.y = ty;
    return true;
  }
  unit.x += ((tx - unit.x) / d) * maxStep;
  unit.y += ((ty - unit.y) / d) * maxStep;
  return false;
}

export function addEffect(state, effect) {
  state.effects.push({ ...effect, maxTtl: effect.ttl });
}

export function updateTimers(state, dt) {
  for (const e of state.effects) e.ttl -= dt;
  state.effects = state.effects.filter((e) => e.ttl > 0);
  for (const m of state.messages) m.ttl -= dt;
  state.messages = state.messages.filter((m) => m.ttl > 0);
}
