// Shared combat helpers: target search and damage application (with shields and armour).

import { dist, pushMessage, addEffect } from './state.js';
import { carRect } from './train.js';

// --- Hostile targets (for player weapons) --------------------------------

// Nearest living enemy (or nest) within range. Rushers beat everything when preferRushers,
// nests are only shot when nothing else is in range.
export function findEnemyTarget(state, x, y, range, { preferRushers = false, minRange = 0 } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > range || d < minRange) continue;
    const score = preferRushers && e.type === 'rusher' ? d - 10000 : d;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  for (const n of state.nests) {
    if (n.hp <= 0) continue;
    const d = dist(x, y, n.x, n.y) - n.radius;
    if (d > range || d < minRange) continue;
    if (d + 1000 < bestScore) {
      bestScore = d + 1000;
      best = n;
    }
  }
  return best;
}

export function shoot(state, fromX, fromY, toX, toY, color, width = 2) {
  addEffect(state, { kind: 'tracer', x1: fromX, y1: fromY, x2: toX, y2: toY, color, width, ttl: 0.12 });
}

// Works for enemies and nests. Armour is a flat reduction per hit; pierce ignores it.
export function damageEnemy(state, enemy, amount, { pierce = false } = {}) {
  if (enemy.hp <= 0) return;
  const armor = pierce || enemy.kind === 'nest' ? 0 : (state.config.enemies[enemy.type]?.armor ?? 0);
  enemy.hp -= Math.max(amount > 1 ? 1 : amount, amount - armor);
  enemy.hitFlash = 0.1;
  if (enemy.kind === 'nest') enemy.awake = true;
}

// Explosion on the hostile side: all enemies and nests in radius.
export function splashEnemies(state, x, y, radius, damage) {
  for (const e of state.enemies) {
    if (e.hp > 0 && dist(x, y, e.x, e.y) <= radius + state.config.enemies[e.type].radius) damageEnemy(state, e, damage, { pierce: true });
  }
  for (const n of state.nests) {
    if (n.hp > 0 && dist(x, y, n.x, n.y) <= radius + n.radius) damageEnemy(state, n, damage, { pierce: true });
  }
}

// --- Player-side damage --------------------------------------------------

// Shield cars soak damage aimed at anything inside their bubble.
function shieldAbsorb(state, x, y, amount) {
  const cars = state.train.cars;
  for (let i = 0; i < cars.length && amount > 0; i++) {
    const car = cars[i];
    const def = state.config.cars[car.type].shield;
    if (!def || car.hp <= 0 || car.shield <= 0) continue;
    const r = carRect(state, i);
    if (dist(x, y, r.cx, r.cy) > def.radius) continue;
    const absorbed = Math.min(car.shield, amount);
    car.shield -= absorbed;
    car.shieldIdle = 0;
    amount -= absorbed;
    addEffect(state, { kind: 'shieldHit', x, y, ttl: 0.25 });
  }
  return amount;
}

export function damageCar(state, car, amount, { crash = false } = {}) {
  if (car.hp <= 0) return;
  const cars = state.train.cars;
  const i = cars.indexOf(car);
  if (car.type !== 'armor') {
    for (const j of [i - 1, i + 1]) {
      const n = cars[j];
      if (n && n.type === 'armor' && n.hp > 0) {
        amount *= 1 - state.config.cars.armor.adjacentReduction;
        break;
      }
    }
  }
  if (!crash && i >= 0) {
    const r = carRect(state, i);
    amount = shieldAbsorb(state, r.cx, r.cy, amount);
  }
  if (amount <= 0) return;
  car.hp = Math.max(0, car.hp - amount);
  car.hitFlash = 0.1;
  if (car.hp === 0 && car.type !== 'locomotive') {
    pushMessage(state, `${state.config.cars[car.type].label} disabled`, 'bad');
  }
}

// Crew member or vehicle outside the train.
export function damageUnit(state, u, amount) {
  amount = shieldAbsorb(state, u.x, u.y, amount);
  if (amount <= 0) return;
  if (u.kind === 'vehicle') {
    if (u.destroyed) return;
    const armor = state.config.vehicles[u.type].armor ?? 0;
    u.hp -= Math.max(1, amount - armor);
    u.hitFlash = 0.1;
    if (u.hp <= 0) destroyVehicle(state, u);
    return;
  }
  if (!u.alive) return;
  u.hp -= amount;
  u.hitFlash = 0.1;
  if (u.hp <= 0) {
    u.hp = 0;
    u.alive = false;
    u.order = null;
    u.carry = null;
    u.kit = false;
    pushMessage(state, `${u.name} was killed`, 'bad');
    addEffect(state, { kind: 'burst', x: u.x, y: u.y, r: 18, color: '#ffffff', ttl: 0.5 });
  }
}

export function destroyVehicle(state, v) {
  v.hp = 0;
  v.destroyed = true;
  v.deployed = false;
  v.order = null;
  const bay = state.train.cars.find((c) => c.id === v.bayCarId);
  if (bay) bay.vehicleId = null;
  addEffect(state, { kind: 'burst', x: v.x, y: v.y, r: 45, color: '#ffb347', ttl: 0.6 });
  const driver = state.crew.find((c) => c.id === v.driverId);
  if (driver && driver.alive) {
    driver.inVehicle = null;
    driver.aboard = false;
    driver.x = v.x;
    driver.y = v.y + 18;
    driver.order = null;
    pushMessage(state, `${state.config.vehicles[v.type].label} destroyed — ${driver.name} bailed out`, 'bad');
  } else {
    pushMessage(state, `${state.config.vehicles[v.type].label} destroyed`, 'bad');
  }
  v.driverId = null;
}

export function damageSentry(state, s, amount) {
  amount = shieldAbsorb(state, s.x, s.y, amount);
  if (amount <= 0 || s.hp <= 0) return;
  s.hp -= amount;
  s.hitFlash = 0.1;
  if (s.hp <= 0) {
    s.hp = 0;
    state.stats.sentriesLost++;
    addEffect(state, { kind: 'burst', x: s.x, y: s.y, r: 24, color: '#b49be0', ttl: 0.4 });
    pushMessage(state, 'Sentry gun destroyed', 'bad');
  }
}

// target: { kind: 'unit' | 'car' | 'sentry', ref }
export function damagePlayerTarget(state, target, amount) {
  if (target.kind === 'car') damageCar(state, target.ref, amount);
  else if (target.kind === 'sentry') damageSentry(state, target.ref, amount);
  else damageUnit(state, target.ref, amount);
}
