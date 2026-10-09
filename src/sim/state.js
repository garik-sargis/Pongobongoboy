// Game state construction and small shared helpers.
// The simulation is plain data + functions with no DOM or canvas access,
// so it can run headless in tests.

import { createRng } from './rng.js';

export function createState(config, level, seed = level.seed) {
  let nextId = 1;
  const id = () => nextId++;

  const cars = config.train.startCars.map((type) => {
    const def = config.cars[type];
    return { id: id(), type, hp: def.hp, maxHp: def.hp, cooldown: 0 };
  });

  const crew = config.crew.names.map((name) => ({
    id: id(),
    name,
    hp: config.crew.hp,
    maxHp: config.crew.hp,
    x: level.startX,
    y: config.world.trackY,
    aboard: true,
    alive: true,
    order: null,
    cooldown: 0,
    fighting: false,
    working: false,
    blocked: null,
  }));

  const nodes = level.nodes.map((n) => ({
    id: id(),
    kind: n.kind,
    x: n.x,
    y: n.y,
    amount: n.amount,
    max: n.amount,
    radius: 14 + Math.sqrt(n.amount) * 2,
  }));

  return {
    config,
    level,
    rng: createRng(seed),
    newId: id,
    time: 0,
    started: false,          // spawner stays idle until the train first departs
    train: { head: level.startX, speed: 0, running: false, cars, distance: 0 },
    fuel: config.train.startFuel,
    scrap: 0,
    crew,
    nodes,
    enemies: [],
    threat: config.spawner.baselineThreat,
    stoppedTime: 0,
    spawnTimer: config.spawner.firstSpawnDelay,
    spawnsEnabled: true,
    effects: [],
    messages: [],
    stats: { kills: 0, fuelGathered: 0, scrapGathered: 0 },
    outcome: null,
  };
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
