// Units: crew members and driven vehicles (tank, excavator).
// They take move / work / board / deploy orders and fight automatically.
//
// Resources are physically hauled: a unit digs a load (up to its carry capacity) at a deposit,
// walks it back to the train, unloads, and returns to the deposit until it is empty.

import { moveToward, dist, pushMessage } from './state.js';
import { carRect, isStationary, nearestCarIndex, nearestPointOnCar, fuelCapacity } from './train.js';
import { fireWeapon } from './weapons.js';
import { getSite, siteActive, siteRadius, workSite } from './sites.js';

// --- Lookups --------------------------------------------------------------

export function aliveCrew(state) {
  return state.crew.filter((c) => c.alive);
}

// Crew standing outside (not aboard, not driving).
export function crewOutside(state) {
  return state.crew.filter((c) => c.alive && !c.aboard && !c.inVehicle);
}

export function deployedVehicles(state) {
  return state.vehicles.filter((v) => v.deployed && !v.destroyed);
}

// Everything of ours walking or driving around outside the train.
export function activeUnits(state) {
  return [...crewOutside(state), ...deployedVehicles(state)];
}

export function findUnit(state, id) {
  return state.crew.find((c) => c.id === id) ?? state.vehicles.find((v) => v.id === id) ?? null;
}

export function isSelectable(u) {
  if (!u) return false;
  if (u.kind === 'vehicle') return u.deployed && !u.destroyed;
  return u.alive && !u.inVehicle;
}

export function unitStats(state, u) {
  if (u.kind === 'vehicle') {
    const d = state.config.vehicles[u.type];
    return { speed: d.speed, radius: d.radius, weapon: d.weapon, carry: d.carry, gatherRate: d.gatherRate, workMultiplier: d.workMultiplier };
  }
  const c = state.config.crew;
  return {
    speed: c.speed,
    radius: c.radius,
    weapon: { kind: 'gun', range: c.range, damage: c.damage, interval: c.fireInterval, color: '#fff2c0' },
    carry: c.carry,
    gatherRate: c.gatherRate,
    workMultiplier: 1,
  };
}

// --- Orders ---------------------------------------------------------------
//   { type: 'move', x, y }
//   { type: 'work', kind: 'node'|'wreck'|'barricade'|'survivor'|'sentry', id }
//   { type: 'board' }
//   { type: 'deploy', x, y }     crew only: fetch a sentry kit, carry it out, build it

export function orderUnit(state, id, order) {
  const u = findUnit(state, id);
  if (!isSelectable(u) || state.outcome) return { ok: false, reason: 'Unavailable' };
  const stats = unitStats(state, u);

  if (order.type === 'deploy' && u.kind !== 'crew') return { ok: false, reason: 'Only crew can set up sentries' };
  if (order.type === 'work') {
    if (order.kind === 'node' && !stats.carry) return { ok: false, reason: `The ${u.name} can't dig` };
    if (order.kind === 'survivor' && u.kind !== 'crew') return { ok: false, reason: 'Send crew to rescue survivors' };
    if (order.kind === 'sentry' && (u.kind !== 'crew' || u.kit)) return { ok: false, reason: 'Needs a crew member with free hands' };
  }

  if (u.kind === 'crew' && u.aboard) {
    if (order.type === 'board') return { ok: true };
    if (!isStationary(state)) return { ok: false, reason: 'Stop the train to deploy crew' };
    disembark(state, u, order);
  }
  u.order = { ...order, phase: null, t: 0 };
  u.blocked = null;
  return { ok: true };
}

export function recallAll(state) {
  for (const u of activeUnits(state)) u.order = { type: 'board' };
}

function orderTarget(state, order) {
  if (order.type === 'move' || order.type === 'deploy') return { x: order.x, y: order.y };
  if (order.type === 'work') return getSite(state, order);
  return null;
}

// Step off the train on the side facing the destination.
function disembark(state, c, order) {
  const trackY = state.world.trackY;
  const target = orderTarget(state, order) ?? { x: state.train.head, y: trackY + 1 };
  const { index } = nearestCarIndex(state, target.x, target.y);
  const r = carRect(state, index);
  const side = target.y < trackY ? -1 : 1;
  // Stagger by id so a group stepping off together doesn't stack.
  c.x = Math.max(r.x0, Math.min(r.x1, target.x)) + ((c.id % 3) - 1) * 14;
  c.y = trackY + side * (state.config.train.carHeight / 2 + state.config.crew.radius + 2);
  c.aboard = false;
}

// --- Update ---------------------------------------------------------------

function seatPosition(state, crewIndex) {
  const cars = state.train.cars.length;
  const r = carRect(state, crewIndex % cars);
  const offset = (Math.floor(crewIndex / cars) - 0.5) * 12;
  return { x: r.cx + offset, y: r.cy };
}

export function updateUnits(state, dt) {
  const H = state.world.height;
  // Index loop: rescues can append crew mid-update.
  for (let idx = 0; idx < state.crew.length; idx++) {
    const c = state.crew[idx];
    if (!c.alive) continue;
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    c.working = false;
    if (c.inVehicle) {
      const v = state.vehicles.find((x) => x.id === c.inVehicle);
      if (v) {
        c.x = v.x;
        c.y = v.y;
      }
      continue;
    }
    if (c.aboard) {
      const seat = seatPosition(state, idx);
      c.x = seat.x;
      c.y = seat.y;
      c.fighting = false;
      c.order = null;
      if (c.kit) returnKit(state, c);
      continue;
    }
    updateActiveUnit(state, c, dt, H);
  }
  for (const v of state.vehicles) {
    if (!v.deployed || v.destroyed) continue;
    v.hitFlash = Math.max(0, v.hitFlash - dt);
    v.working = false;
    updateActiveUnit(state, v, dt, H);
  }
}

function updateActiveUnit(state, u, dt, H) {
  const stats = unitStats(state, u);

  // Auto-fight.
  u.fighting = stats.weapon ? fireWeapon(state, u, u.x, u.y, stats.weapon, dt) : false;

  const step = stats.speed * dt;
  const order = u.order;
  if (order) {
    if (order.type === 'move') {
      if (moveToward(u, order.x, order.y, step)) u.order = null;
    } else if (order.type === 'board') {
      updateBoard(state, u, step);
    } else if (order.type === 'work') {
      if (order.kind === 'node') updateHaul(state, u, order, stats, step, dt);
      else updateWork(state, u, order, stats, step, dt);
    } else if (order.type === 'deploy') {
      updateDeploy(state, u, order, step, dt);
    }
  }
  u.y = Math.max(stats.radius, Math.min(H - stats.radius, u.y));
}

// Walk to the edge of a site, fanned out a little per unit so they don't stack.
// Returns true once in reach.
function approach(state, u, site, extra, step) {
  const reach = siteRadius(null, site) + extra;
  const d = dist(u.x, u.y, site.x, site.y);
  if (d <= reach) return true;
  const angle = Math.atan2(u.y - site.y, u.x - site.x) + ((u.id % 4) - 1.5) * 0.45;
  moveToward(u, site.x + Math.cos(angle) * (reach - 4), site.y + Math.sin(angle) * (reach - 4), step);
  return false;
}

// Walk to the nearest point of the train. Returns true once alongside it.
function approachTrain(state, u, step, carIndex = null) {
  const index = carIndex ?? nearestCarIndex(state, u.x, u.y).index;
  const p = nearestPointOnCar(state, index, u.x, u.y);
  const reach = state.config.crew.boardRange + (u.kind === 'vehicle' ? 14 : 0);
  if (dist(u.x, u.y, p.x, p.y) <= reach) return true;
  moveToward(u, p.x, p.y, step);
  return false;
}

function updateBoard(state, u, step) {
  if (u.kind === 'vehicle') {
    const bayIndex = state.train.cars.findIndex((c) => c.id === u.bayCarId);
    if (!approachTrain(state, u, step, bayIndex >= 0 ? bayIndex : null)) return;
    unloadCarry(state, u);
    dockVehicle(state, u, bayIndex >= 0);
    return;
  }
  if (!approachTrain(state, u, step)) return;
  unloadCarry(state, u);
  u.aboard = true;
  u.order = null;
}

// Haul loop: dig a load → carry it to the train → unload → back to the deposit.
function updateHaul(state, u, order, stats, step, dt) {
  const node = getSite(state, order);
  const nodeLive = siteActive('node', node);
  const load = u.carry?.amount ?? 0;

  if (!order.phase) order.phase = load > 0 && u.carry.kind !== node?.kind ? 'deliver' : 'dig';
  if (order.phase === 'dig' && (load >= stats.carry - 1e-6 || (!nodeLive && load > 0))) order.phase = 'deliver';
  if (order.phase === 'dig' && !nodeLive) {
    u.order = null;
    return;
  }

  if (order.phase === 'deliver') {
    if (!approachTrain(state, u, step)) return;
    unloadCarry(state, u);
    if (u.carry && u.carry.amount > 0) {
      u.blocked = 'full'; // fuel tanks are full: wait here with the load
      return;
    }
    u.blocked = null;
    if (nodeLive) order.phase = 'dig';
    else u.order = null;
    return;
  }

  if (!approach(state, u, node, state.config.crew.interactRange, step)) return;
  if (state.config.crew.pauseGatherWhenFighting && u.fighting) {
    u.blocked = 'fighting';
    return;
  }
  u.blocked = null;
  const take = Math.min(stats.gatherRate * dt, node.amount, stats.carry - load);
  if (!u.carry) u.carry = { kind: node.kind, amount: 0 };
  u.carry.amount += take;
  node.amount = Math.max(0, node.amount - take);
  u.working = true;
  if (node.amount <= 1e-6) {
    node.amount = 0;
    pushMessage(state, `${node.kind === 'fuel' ? 'Fuel' : 'Scrap'} deposit exhausted`, 'info');
  }
}

export function unloadCarry(state, u) {
  if (!u.carry || u.carry.amount <= 0) {
    u.carry = null;
    return;
  }
  if (u.carry.kind === 'fuel') {
    const put = Math.min(u.carry.amount, fuelCapacity(state) - state.fuel);
    state.fuel += put;
    state.stats.fuelGathered += put;
    u.carry.amount -= put;
  } else {
    state.scrap += u.carry.amount;
    state.stats.scrapGathered += u.carry.amount;
    u.carry.amount = 0;
  }
  if (u.carry.amount <= 1e-6) u.carry = null;
}

function updateWork(state, u, order, stats, step, dt) {
  const site = getSite(state, order);
  if (!siteActive(order.kind, site)) {
    u.order = null;
    u.blocked = null;
    return;
  }
  if (!approach(state, u, site, state.config.crew.interactRange, step)) return;
  const res = workSite(state, u, order.kind, site, dt * stats.workMultiplier);
  u.working = res.working;
  u.blocked = res.blocked;
  if (res.done) {
    u.order = null;
    u.blocked = null;
  }
}

// --- Sentry kits ------------------------------------------------------------

function takeKit(state) {
  const armory = state.train.cars.find((c) => c.kits > 0 && c.hp > 0);
  if (!armory) return false;
  armory.kits--;
  return true;
}

function returnKit(state, c) {
  c.kit = false;
  const armory = state.train.cars.find((car) => car.kits != null);
  if (armory) armory.kits++;
}

export function kitsAvailable(state) {
  return state.train.cars.reduce((n, c) => n + (c.hp > 0 ? (c.kits ?? 0) : 0), 0);
}

function updateDeploy(state, u, order, step, dt) {
  if (!u.kit) {
    if (!approachTrain(state, u, step)) return;
    if (!takeKit(state)) {
      pushMessage(state, 'No sentry kits left (need a working armoury car)', 'bad');
      u.order = null;
      return;
    }
    u.kit = true;
  }
  if (!moveToward(u, order.x, order.y, step)) return;
  order.t += dt;
  u.working = true;
  if (order.t >= state.config.sentry.deployTime) {
    const def = state.config.sentry;
    state.sentries.push({ id: state.newId(), kind: 'sentry', x: order.x, y: order.y - 16, hp: def.hp, maxHp: def.hp, radius: def.radius, cooldown: 0, hitFlash: 0 });
    u.kit = false;
    u.order = null;
    pushMessage(state, 'Sentry gun online', 'good');
  }
}

// --- Vehicles ---------------------------------------------------------------

export function deployVehicle(state, carId, preferredCrewId = null) {
  const car = state.train.cars.find((c) => c.id === carId);
  const def = car && state.config.cars[car.type];
  if (!car || !def.vehicle) return { ok: false, reason: 'Not a vehicle bay' };
  if (!isStationary(state)) return { ok: false, reason: 'Stop the train to deploy a vehicle' };
  if (car.hp <= 0) return { ok: false, reason: 'The bay is disabled — repair it first' };
  const v = state.vehicles.find((x) => x.id === car.vehicleId);
  if (!v || v.destroyed) return { ok: false, reason: 'The bay is empty' };
  if (v.deployed) return { ok: false, reason: 'Already deployed' };
  const aboard = state.crew.filter((c) => c.alive && c.aboard);
  const driver = aboard.find((c) => c.id === preferredCrewId) ?? aboard[0];
  if (!driver) return { ok: false, reason: 'Nobody aboard to drive it' };

  const i = state.train.cars.indexOf(car);
  const r = carRect(state, i);
  driver.aboard = false;
  driver.inVehicle = v.id;
  driver.order = null;
  v.driverId = driver.id;
  v.deployed = true;
  v.x = r.cx;
  v.y = state.world.trackY + 52;
  v.order = null;
  pushMessage(state, `${driver.name} takes the ${state.config.vehicles[v.type].label.toLowerCase()} out`, 'good');
  return { ok: true, vehicle: v };
}

function dockVehicle(state, v, hasBay) {
  const driver = state.crew.find((c) => c.id === v.driverId);
  if (driver && driver.alive) {
    driver.inVehicle = null;
    driver.aboard = true;
  }
  v.driverId = null;
  v.deployed = false;
  v.order = null;
  if (!hasBay) {
    // Its bay was detached: the vehicle is abandoned and the driver climbs aboard.
    state.vehicles = state.vehicles.filter((x) => x !== v);
    pushMessage(state, `${state.config.vehicles[v.type].label} abandoned — no bay to dock in`, 'bad');
  }
}
