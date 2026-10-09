// Train: car layout, movement, fuel, and car-mounted weapons.

import { pushMessage } from './state.js';
import { findEnemyTarget, shoot, damageEnemy } from './combat.js';

// --- Layout -------------------------------------------------------------

export function carRect(state, index) {
  const t = state.config.train;
  const x1 = state.train.head - index * (t.carLength + t.carGap);
  const x0 = x1 - t.carLength;
  const y0 = state.config.world.trackY - t.carHeight / 2;
  return { x0, x1, y0, y1: y0 + t.carHeight, cx: (x0 + x1) / 2, cy: state.config.world.trackY };
}

export function trainTail(state) {
  return carRect(state, state.train.cars.length - 1).x0;
}

// Closest point on a car's rectangle to (x, y); used for targeting and boarding.
export function nearestPointOnCar(state, index, x, y) {
  const r = carRect(state, index);
  return {
    x: Math.max(r.x0, Math.min(r.x1, x)),
    y: Math.max(r.y0, Math.min(r.y1, y)),
  };
}

export function nearestCarIndex(state, x, y, { aliveOnly = false } = {}) {
  let best = -1;
  let bestD = Infinity;
  state.train.cars.forEach((car, i) => {
    if (aliveOnly && car.hp <= 0) return;
    const p = nearestPointOnCar(state, i, x, y);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { index: best, distance: bestD };
}

// --- Fuel ---------------------------------------------------------------

export function fuelBurnPer100(state) {
  const t = state.config.train;
  return t.fuelPer100Base + t.fuelPer100PerCar * state.train.cars.length;
}

export function fuelCapacity(state) {
  let cap = state.config.train.engineFuelCapacity;
  for (const car of state.train.cars) {
    if (car.hp > 0 && car.type === 'fuelTank') cap += state.config.cars.fuelTank.fuelCapacity;
  }
  return cap;
}

// --- Movement state -----------------------------------------------------

export function isStationary(state) {
  return state.train.speed < 0.5;
}

export function isCrawling(state) {
  return state.train.running && state.fuel <= 0;
}

// "Exposed" = stopped or crawling; this is what drives threat escalation.
export function isExposed(state) {
  return isStationary(state) || isCrawling(state);
}

export function setTrainRunning(state, running) {
  if (state.outcome) return;
  state.train.running = running;
  if (running) state.started = true;
}

export function updateTrain(state, dt) {
  const tr = state.train;
  const t = state.config.train;
  const target = tr.running ? (state.fuel > 0 ? t.maxSpeed : t.maxSpeed * t.crawlSpeedFraction) : 0;
  if (tr.speed < target) tr.speed = Math.min(target, tr.speed + t.accel * dt);
  else tr.speed = Math.max(target, tr.speed - t.decel * dt);

  const d = tr.speed * dt;
  if (d > 0) {
    tr.head += d;
    tr.distance += d;
    if (state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - (d / 100) * fuelBurnPer100(state));
      if (state.fuel === 0) pushMessage(state, 'Out of fuel — crawling', 'bad');
    }
  }
  // Capacity can drop when a tank car is disabled.
  state.fuel = Math.min(state.fuel, fuelCapacity(state));

  for (const car of tr.cars) {
    if (car.hitFlash) car.hitFlash = Math.max(0, car.hitFlash - dt);
  }
}

// --- Car-mounted weapons ------------------------------------------------

export function updateCarWeapons(state, dt) {
  state.train.cars.forEach((car, i) => {
    if (car.type !== 'turret' || car.hp <= 0) return;
    const def = state.config.cars.turret;
    car.cooldown = Math.max(0, car.cooldown - dt);
    const r = carRect(state, i);
    const target = findEnemyTarget(state, r.cx, r.cy, def.range, true);
    car.aim = target ? Math.atan2(target.y - r.cy, target.x - r.cx) : car.aim;
    if (target && car.cooldown === 0) {
      damageEnemy(state, target, def.damage);
      shoot(state, r.cx, r.cy, target.x, target.y, '#9cc8ff');
      car.cooldown = def.fireInterval;
    }
  });
}

// --- Repair -------------------------------------------------------------

export function repairCar(state, carId) {
  const car = state.train.cars.find((c) => c.id === carId);
  const cfg = state.config.repair;
  if (!car) return { ok: false, reason: 'No such car' };
  if (!isStationary(state)) return { ok: false, reason: 'Stop the train to repair' };
  if (car.hp >= car.maxHp) return { ok: false, reason: 'Already at full HP' };
  if (state.scrap < cfg.scrapCost) return { ok: false, reason: `Need ${cfg.scrapCost} scrap` };
  const wasDisabled = car.hp <= 0;
  car.hp = Math.min(car.maxHp, car.hp + cfg.hpPerAction);
  state.scrap -= cfg.scrapCost;
  if (wasDisabled) pushMessage(state, `${state.config.cars[car.type].label} back online`, 'good');
  return { ok: true };
}
