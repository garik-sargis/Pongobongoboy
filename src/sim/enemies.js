// Enemies: simple "pick nearest target, approach, attack" AI.
//  - shooter: stops at range and fires.
//  - rusher: fast, runs into its target and explodes.

import { addEffect, dist, moveToward } from './state.js';
import { nearestPointOnCar, trainTail } from './train.js';
import { damageCar, damageCrew } from './combat.js';

export function spawnEnemy(state, type, x, y) {
  const def = state.config.enemies[type];
  const e = { id: state.newId(), type, x, y, hp: def.hp, maxHp: def.hp, cooldown: def.fireInterval ?? 0, target: null, retarget: 0, hitFlash: 0 };
  state.enemies.push(e);
  return e;
}

// Candidate targets: crew outside the train, and cars that still have HP.
function acquireTarget(state, e) {
  let best = null;
  let bestD = Infinity;
  for (const c of state.crew) {
    if (!c.alive || c.aboard) continue;
    const d = dist(e.x, e.y, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'crew', id: c.id };
    }
  }
  state.train.cars.forEach((car, i) => {
    if (car.hp <= 0) return;
    const p = nearestPointOnCar(state, i, e.x, e.y);
    const d = dist(e.x, e.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'car', id: car.id };
    }
  });
  return best;
}

// Resolve a target reference into a live position, or null if it is gone.
function resolveTarget(state, e) {
  const t = e.target;
  if (!t) return null;
  if (t.kind === 'crew') {
    const c = state.crew.find((m) => m.id === t.id);
    if (!c || !c.alive || c.aboard) return null;
    return { x: c.x, y: c.y, ref: c };
  }
  const i = state.train.cars.findIndex((car) => car.id === t.id);
  if (i < 0 || state.train.cars[i].hp <= 0) return null;
  const p = nearestPointOnCar(state, i, e.x, e.y);
  return { x: p.x, y: p.y, ref: state.train.cars[i] };
}

function applyDamage(state, target, amount) {
  if (target.kind === 'crew') damageCrew(state, target.ref, amount);
  else damageCar(state, target.ref, amount);
}

function explode(state, e) {
  const def = state.config.enemies.rusher;
  addEffect(state, { kind: 'burst', x: e.x, y: e.y, r: def.blastRadius, color: def.color, ttl: 0.4 });
  for (const c of state.crew) {
    if (c.alive && !c.aboard && dist(e.x, e.y, c.x, c.y) <= def.blastRadius) damageCrew(state, c, def.damage);
  }
  state.train.cars.forEach((car, i) => {
    const p = nearestPointOnCar(state, i, e.x, e.y);
    if (dist(e.x, e.y, p.x, p.y) <= def.blastRadius) damageCar(state, car, def.damage);
  });
  e.hp = 0;
  e.exploded = true;
}

export function updateEnemies(state, dt) {
  const cfg = state.config.enemies;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const def = cfg[e.type];
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.retarget -= dt;
    if (e.retarget <= 0 || !resolveTarget(state, e)) {
      e.target = acquireTarget(state, e);
      e.retarget = cfg.retargetInterval;
    }
    const tgt = resolveTarget(state, e);
    if (!tgt) continue;
    const target = { kind: e.target.kind, ref: tgt.ref };
    const d = dist(e.x, e.y, tgt.x, tgt.y);

    if (e.type === 'shooter') {
      if (d > def.range * 0.85) moveToward(e, tgt.x, tgt.y, def.speed * dt);
      if (d <= def.range && e.cooldown === 0) {
        applyDamage(state, target, def.damage);
        addEffect(state, { kind: 'tracer', x1: e.x, y1: e.y, x2: tgt.x, y2: tgt.y, color: '#ff7a6b', ttl: 0.12 });
        e.cooldown = def.fireInterval;
      }
    } else if (e.type === 'rusher') {
      moveToward(e, tgt.x, tgt.y, def.speed * dt);
      if (dist(e.x, e.y, tgt.x, tgt.y) <= def.radius + 4) explode(state, e);
    }
  }

  // Remove dead and far-behind enemies.
  const behind = trainTail(state) - cfg.despawnBehind;
  state.enemies = state.enemies.filter((e) => {
    if (e.hp <= 0) {
      if (!e.exploded) {
        state.stats.kills++;
        addEffect(state, { kind: 'burst', x: e.x, y: e.y, r: 14, color: cfg[e.type].color, ttl: 0.3 });
      }
      return false;
    }
    return e.x > behind;
  });
}
