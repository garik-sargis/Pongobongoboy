// Train: car layout, movement, fuel, barricade collisions, mine laying, repair.

import { pushMessage, addEffect } from './state.js';
import { damageCar } from './combat.js';

// --- Layout -------------------------------------------------------------

export function carRect(state, index) {
  const t = state.config.train;
  const x1 = state.train.head - index * (t.carLength + t.carGap);
  const x0 = x1 - t.carLength;
  const y0 = state.world.trackY - t.carHeight / 2;
  return { x0, x1, y0, y1: y0 + t.carHeight, cx: (x0 + x1) / 2, cy: state.world.trackY };
}

export function trainTail(state) {
  return carRect(state, state.train.cars.length - 1).x0;
}

// Closest point on a car's rectangle to (x, y); used for targeting, boarding and unloading.
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

export function distanceToTrain(state, x, y) {
  return nearestCarIndex(state, x, y).distance;
}

// --- Fuel ---------------------------------------------------------------

export function trainWeight(state) {
  return state.train.cars.reduce((sum, car) => sum + (state.config.cars[car.type].weight ?? 1), 0);
}

export function fuelBurnPer100(state) {
  const t = state.config.train;
  return t.fuelPer100Base + t.fuelPer100PerCar * trainWeight(state);
}

export function fuelCapacity(state) {
  let cap = state.config.train.engineFuelCapacity;
  for (const car of state.train.cars) {
    const extra = state.config.cars[car.type].fuelCapacity;
    if (car.hp > 0 && extra) cap += extra;
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
  tr.shunting = Math.max(0, tr.shunting - dt);
  const canMove = tr.running && tr.shunting === 0;
  const target = canMove ? (state.fuel > 0 ? t.maxSpeed : t.maxSpeed * t.crawlSpeedFraction) : 0;
  if (tr.speed < target) tr.speed = Math.min(target, tr.speed + t.accel * dt);
  else tr.speed = Math.max(target, tr.speed - t.decel * dt);

  let d = tr.speed * dt;
  tr.blockedBy = null;
  const barricade = nextBarricade(state);
  if (barricade && tr.head + d >= barricade.x) {
    d = Math.max(0, barricade.x - tr.head);
    hitBarricade(state, barricade);
  }
  if (d > 0) {
    tr.head += d;
    tr.distance += d;
    if (state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - (d / 100) * fuelBurnPer100(state));
      if (state.fuel === 0) pushMessage(state, 'Out of fuel — crawling', 'bad');
    }
    layMines(state, d);
  }
  // Capacity can drop when a tank car is disabled.
  state.fuel = Math.min(state.fuel, fuelCapacity(state));

  for (const car of tr.cars) {
    if (car.hitFlash) car.hitFlash = Math.max(0, car.hitFlash - dt);
  }
}

// --- Barricades ---------------------------------------------------------

export function nextBarricade(state) {
  let best = null;
  for (const b of state.barricades) {
    if (b.broken || b.x < state.train.head - 1) continue;
    if (!best || b.x < best.x) best = b;
  }
  return best;
}

function activeRam(state) {
  const front = state.train.cars[0];
  const def = state.config.cars[front.type];
  return front.hp > 0 && def.ramDamageMultiplier != null ? def : null;
}

// What happens if the train hits this barricade at speed right now.
export function ramOutcome(state, barricade) {
  const ram = activeRam(state);
  if (ram) return { breaks: true, damage: Math.round(barricade.strength * ram.ramDamageMultiplier) };
  if (barricade.reinforced) return { breaks: false, damage: state.config.barricade.reinforcedCrashDamage };
  return { breaks: true, damage: barricade.strength };
}

export function ramDamage(state, barricade) {
  return ramOutcome(state, barricade).damage;
}

function hitBarricade(state, b) {
  const tr = state.train;
  const cfg = state.config.barricade;
  if (state.fuel <= 0 && tr.speed < cfg.minRamSpeed) {
    // Crawling on an empty tank: too weak to break through, the train stops against it.
    // (With fuel, the engine can always shove through, even from a standstill.)
    tr.head = b.x;
    tr.speed = 0;
    tr.blockedBy = b.id;
    return;
  }
  const front = tr.cars[0];
  const label = state.config.cars[front.type].label;
  const out = ramOutcome(state, b);
  if (!out.breaks) {
    // Only a real impact hurts; leaning on it from a standstill just keeps the train stopped.
    if (tr.speed >= cfg.minRamSpeed) {
      damageCar(state, front, out.damage, { crash: true });
      addEffect(state, { kind: 'burst', x: b.x, y: b.y, r: 50, color: '#ffb347', ttl: 0.6 });
      pushMessage(state, `Reinforced barricade! ${label} -${out.damage} HP. Needs a ram car at the front, or dig it out.`, 'bad');
    }
    tr.head = b.x;
    tr.speed = 0;
    tr.blockedBy = b.id;
    return;
  }
  damageCar(state, front, out.damage, { crash: true });
  addEffect(state, { kind: 'burst', x: b.x, y: b.y, r: 50, color: '#ffb347', ttl: 0.6 });
  b.broken = true;
  tr.speed *= cfg.speedAfterRam;
  state.stats.barricadesRammed++;
  pushMessage(state, `Rammed the barricade: ${label} -${out.damage} HP`, out.damage > 40 ? 'bad' : 'info');
}

// --- Mines --------------------------------------------------------------

function layMines(state, d) {
  const cars = state.train.cars;
  const rear = cars[cars.length - 1];
  const def = state.config.cars[rear.type].mines;
  if (!def || rear.hp <= 0) return;
  state.train.mineDist += d;
  if (state.train.mineDist < def.spacing) return;
  state.train.mineDist = 0;
  const r = carRect(state, cars.length - 1);
  state.mines.push({ id: state.newId(), x: r.x0 - 14, y: state.world.trackY + (state.rng() - 0.5) * 30, arm: def.armTime });
  if (state.mines.length > def.max) state.mines.shift();
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

// Docked vehicles are repaired through their bay.
export function repairVehicle(state, carId) {
  const car = state.train.cars.find((c) => c.id === carId);
  const v = car && state.vehicles.find((x) => x.id === car.vehicleId);
  const cfg = state.config.repair;
  if (!v || v.deployed) return { ok: false, reason: 'Vehicle must be docked' };
  if (!isStationary(state)) return { ok: false, reason: 'Stop the train to repair' };
  if (v.hp >= v.maxHp) return { ok: false, reason: 'Vehicle at full HP' };
  if (state.scrap < cfg.scrapCost) return { ok: false, reason: `Need ${cfg.scrapCost} scrap` };
  v.hp = Math.min(v.maxHp, v.hp + cfg.hpPerAction);
  state.scrap -= cfg.scrapCost;
  return { ok: true };
}
