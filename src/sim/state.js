// Game state construction and small shared helpers.
// The simulation is plain data + functions with no DOM or canvas access,
// so it can run headless in tests.

import { createRng } from './rng.js';
import { generateLevel } from './levelgen.js';

// opts: { seed, loadout: [carTypes front→back], scrap }
export function createState(config, level, opts = {}) {
  let nextId = 1;
  const height = level.height ?? config.world.height;
  const world = { height, trackY: Math.round(height / 2), length: level.exitX };
  const threat = {
    baseline: level.threat?.baseline ?? config.spawner.baselineThreat,
    riseMult: level.threat?.riseMult ?? 1,
    intervalMult: level.threat?.intervalMult ?? 1,
  };

  const state = {
    config,
    level,
    world,
    threatCfg: threat,
    rng: createRng(opts.seed ?? level.seed ?? 1),
    newId: () => nextId++,
    time: 0,
    started: false,          // spawner stays idle until the train first departs
    train: { head: level.startX, speed: 0, running: false, cars: [], distance: 0, shunting: 0, blockedBy: null, mineDist: 0 },
    fuel: level.startFuel ?? config.train.startFuel,
    scrap: opts.scrap ?? level.startScrap ?? 0,
    crew: [],
    vehicles: [],
    sentries: [],
    mines: [],
    shells: [],
    nodes: [],
    nests: [],
    wrecks: [],
    barricades: [],
    survivors: [],
    enemies: [],
    threat: threat.baseline,
    stoppedTime: 0,
    spawnTimer: config.spawner.firstSpawnDelay,
    spawnsEnabled: true,
    fog: createFog(config, world),
    fogTimer: 0,
    effects: [],
    messages: [],
    stats: {
      kills: 0, fuelGathered: 0, scrapGathered: 0, rescued: 0, salvaged: 0,
      barricadesRammed: 0, barricadesCleared: 0, nestsDestroyed: 0, sentriesLost: 0,
    },
    outcome: null,
  };

  const loadout = opts.loadout ?? level.defaultLoadout ?? config.train.startCars;
  state.train.cars = loadout.map((type) => makeCar(state, type));
  for (const name of level.crew ?? config.crew.names) {
    state.crew.push(makeCrewMember(state, name, level.startX, world.trackY, config.crew.hp, true));
  }

  const gen = generateLevel(level, world);
  for (const n of [...(level.nodes ?? []), ...gen.nodes]) makeNode(state, n.kind, n.x, n.y, n.amount);
  for (const n of [...(level.nests ?? []), ...gen.nests]) makeNest(state, n.x, n.y, n.types);
  for (const w of level.wrecks ?? []) {
    const def = config.cars[w.carType];
    const y = w.y ?? world.trackY + (w.dy ?? 0);
    makeWreck(state, w.carType, w.x, y, Math.round(def.hp * (w.hpFraction ?? 0.6)), config.salvage.work,
      def.vehicle ? { vehicleHp: Math.round(config.vehicles[def.vehicle].hp * 0.6) } : {});
  }
  state.barricades = (level.barricades ?? []).map((b) => ({
    id: state.newId(),
    x: b.x,
    y: world.trackY,
    strength: b.strength,
    reinforced: !!b.reinforced,
    work: 0,
    workNeeded: b.strength * config.barricade.clearWorkPerStrength,
    broken: false,
    radius: 24,
  }));
  state.survivors = (level.survivors ?? []).map((s) => ({
    id: state.newId(), name: s.name, x: s.x, y: s.y ?? world.trackY + (s.dy ?? 0), rescued: false, radius: 10,
  }));
  return state;
}

// extra: { kits, vehicleHp } — vehicleHp null means an empty bay.
export function makeCar(state, type, hp = state.config.cars[type].hp, extra = {}) {
  const def = state.config.cars[type];
  const car = { id: state.newId(), type, hp, maxHp: def.hp, cooldown: 0, hitFlash: 0 };
  if (def.kits) car.kits = extra.kits ?? def.kits;
  if (def.shield) {
    car.shield = def.shield.capacity;
    car.shieldIdle = 0;
  }
  if (def.vehicle) {
    car.vehicleId = null;
    const vHp = extra.vehicleHp === undefined ? state.config.vehicles[def.vehicle].hp : extra.vehicleHp;
    if (vHp != null && vHp > 0) car.vehicleId = makeVehicle(state, def.vehicle, car.id, vHp).id;
  }
  return car;
}

export function makeVehicle(state, type, bayCarId, hp) {
  const def = state.config.vehicles[type];
  const v = {
    id: state.newId(),
    kind: 'vehicle',
    type,
    name: def.label,
    bayCarId,
    hp,
    maxHp: def.hp,
    x: 0,
    y: 0,
    deployed: false,
    destroyed: false,
    driverId: null,
    order: null,
    cooldown: 0,
    carry: null,
    fighting: false,
    working: false,
    blocked: null,
    hitFlash: 0,
  };
  state.vehicles.push(v);
  return v;
}

export function makeWreck(state, carType, x, y, hp, workNeeded, carState = {}) {
  const w = { id: state.newId(), carType, x, y, hp, work: 0, workNeeded, done: false, radius: 30, carState };
  state.wrecks.push(w);
  return w;
}

export function makeNode(state, kind, x, y, amount) {
  const n = { id: state.newId(), kind, x, y, amount, max: amount, radius: 12 + Math.sqrt(amount) * 2 };
  state.nodes.push(n);
  return n;
}

export function makeNest(state, x, y, types) {
  const def = state.config.nest;
  const n = { id: state.newId(), kind: 'nest', x, y, types, hp: def.hp, maxHp: def.hp, radius: def.radius, timer: 2, awake: false, hitFlash: 0 };
  state.nests.push(n);
  return n;
}

export function makeCrewMember(state, name, x, y, hp, aboard) {
  return {
    id: state.newId(),
    kind: 'crew',
    name,
    hp,
    maxHp: hp,
    x,
    y,
    aboard,
    alive: true,
    inVehicle: null,
    order: null,
    cooldown: 0,
    fighting: false,
    working: false,
    blocked: null,
    carry: null,
    kit: false,
    hitFlash: 0,
  };
}

function createFog(config, world) {
  const cell = config.fog.cell;
  const cols = Math.ceil((world.length + 1200) / cell);
  const rows = Math.ceil(world.height / cell);
  return { enabled: config.fog.enabled, cell, cols, rows, explored: new Uint8Array(cols * rows) };
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
