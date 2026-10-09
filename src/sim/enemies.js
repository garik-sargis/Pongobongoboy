// Enemy AI. Each enemy picks a target (respecting its preference), approaches and attacks.
// Behaviours:
//   ranged  – stops at range and fires hitscan shots            (shooter)
//   rusher  – runs into the target and explodes                  (rusher)
//   melee   – runs up and hits in close combat                   (swarmer, brute)
//   sniper  – aims with a visible laser, then one heavy shot     (sniper)
//   mortar  – lobs a shell at the target's position; ring marks  (mortar)

import { addEffect, dist, moveToward, pushMessage } from './state.js';
import { nearestPointOnCar, trainTail } from './train.js';
import { activeUnits, unitStats } from './units.js';
import { damagePlayerTarget, damageCar, damageUnit, damageSentry } from './combat.js';

export function spawnEnemy(state, type, x, y, extra = {}) {
  const def = state.config.enemies[type];
  const e = {
    id: state.newId(), kind: 'enemy', type, x, y, hp: def.hp, maxHp: def.hp,
    cooldown: def.interval ?? 0, target: null, retarget: 0, hitFlash: 0, aim: 0, ...extra,
  };
  state.enemies.push(e);
  return e;
}

// Candidate targets: units outside, sentries, cars with HP.
function candidates(state, e) {
  const list = [];
  for (const u of activeUnits(state)) list.push({ kind: 'unit', id: u.id, x: u.x, y: u.y, ref: u, r: unitStats(state, u).radius });
  for (const s of state.sentries) if (s.hp > 0) list.push({ kind: 'sentry', id: s.id, x: s.x, y: s.y, ref: s, r: s.radius });
  state.train.cars.forEach((car, i) => {
    if (car.hp <= 0) return;
    const p = nearestPointOnCar(state, i, e.x, e.y);
    list.push({ kind: 'car', id: car.id, x: p.x, y: p.y, ref: car, r: 0 });
  });
  return list;
}

function acquireTarget(state, e) {
  const def = state.config.enemies[e.type];
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates(state, e)) {
    let score = dist(e.x, e.y, c.x, c.y);
    // Preferences bias the choice but never ignore something right next to the enemy.
    if (def.prefers === 'cars' && c.kind !== 'car' && score > 90) score += 600;
    if (def.prefers === 'units' && c.kind === 'car') score += 500;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? { kind: best.kind, id: best.id } : null;
}

// Resolve a target reference into a live position, or null if it is gone.
function resolveTarget(state, e) {
  const t = e.target;
  if (!t) return null;
  if (t.kind === 'unit') {
    const u = activeUnits(state).find((x) => x.id === t.id);
    return u ? { kind: 'unit', x: u.x, y: u.y, ref: u, r: unitStats(state, u).radius } : null;
  }
  if (t.kind === 'sentry') {
    const s = state.sentries.find((x) => x.id === t.id && x.hp > 0);
    return s ? { kind: 'sentry', x: s.x, y: s.y, ref: s, r: s.radius } : null;
  }
  const i = state.train.cars.findIndex((car) => car.id === t.id);
  if (i < 0 || state.train.cars[i].hp <= 0) return null;
  const p = nearestPointOnCar(state, i, e.x, e.y);
  return { kind: 'car', x: p.x, y: p.y, ref: state.train.cars[i], r: 0 };
}

// Damage everything on the player side within radius (explosions, shells).
export function blastPlayer(state, x, y, radius, damage) {
  for (const u of activeUnits(state)) {
    if (dist(x, y, u.x, u.y) <= radius + unitStats(state, u).radius) damageUnit(state, u, damage);
  }
  for (const s of state.sentries) {
    if (s.hp > 0 && dist(x, y, s.x, s.y) <= radius + s.radius) damageSentry(state, s, damage);
  }
  state.train.cars.forEach((car, i) => {
    const p = nearestPointOnCar(state, i, x, y);
    if (dist(x, y, p.x, p.y) <= radius) damageCar(state, car, damage);
  });
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
      const prev = e.target?.id;
      e.target = acquireTarget(state, e);
      e.retarget = cfg.retargetInterval;
      if (e.target?.id !== prev) e.aim = 0;
    }
    const tgt = resolveTarget(state, e);
    const step = def.speed * dt;
    // Nest children are leashed: they won't chase anything far from home.
    if (e.nestId != null) {
      const home = state.nests.find((n) => n.id === e.nestId && n.hp > 0);
      if (!home) e.nestId = null;
      else if (!tgt || dist(tgt.x, tgt.y, home.x, home.y) > state.config.nest.leash) {
        if (dist(e.x, e.y, home.x, home.y) > home.radius + 40) moveToward(e, home.x, home.y, step);
        continue;
      }
    }
    if (!tgt) continue;
    const target = { kind: tgt.kind, ref: tgt.ref };
    const d = dist(e.x, e.y, tgt.x, tgt.y);

    switch (def.behavior) {
      case 'ranged':
        if (d > def.range * 0.85) moveToward(e, tgt.x, tgt.y, step);
        if (d <= def.range && e.cooldown === 0) {
          damagePlayerTarget(state, target, def.damage);
          addEffect(state, { kind: 'tracer', x1: e.x, y1: e.y, x2: tgt.x, y2: tgt.y, color: '#ff7a6b', width: 2, ttl: 0.12 });
          e.cooldown = def.interval;
        }
        break;
      case 'rusher':
        moveToward(e, tgt.x, tgt.y, step);
        if (dist(e.x, e.y, tgt.x, tgt.y) <= def.radius + tgt.r + 4) {
          addEffect(state, { kind: 'burst', x: e.x, y: e.y, r: def.blastRadius, color: def.color, ttl: 0.4 });
          blastPlayer(state, e.x, e.y, def.blastRadius, def.damage);
          e.hp = 0;
          e.exploded = true;
        }
        break;
      case 'melee': {
        const reach = def.radius + tgt.r + 3;
        if (d > reach) moveToward(e, tgt.x, tgt.y, Math.min(step, d - reach + 0.5));
        else if (e.cooldown === 0) {
          damagePlayerTarget(state, target, def.damage);
          e.cooldown = def.interval;
          e.lunge = 0.12;
        }
        e.lunge = Math.max(0, (e.lunge ?? 0) - dt);
        break;
      }
      case 'sniper':
        if (d > def.range * 0.92) {
          moveToward(e, tgt.x, tgt.y, step);
          e.aim = 0;
        } else if (e.cooldown === 0) {
          e.aim += dt;
          e.aimX = tgt.x;
          e.aimY = tgt.y;
          if (e.aim >= def.aimTime) {
            damagePlayerTarget(state, target, def.damage);
            addEffect(state, { kind: 'tracer', x1: e.x, y1: e.y, x2: tgt.x, y2: tgt.y, color: def.color, width: 3, ttl: 0.25 });
            e.aim = 0;
            e.cooldown = def.interval;
          }
        }
        break;
      case 'mortar':
        if (d > def.range * 0.9) moveToward(e, tgt.x, tgt.y, step);
        else if (d < def.minRange) moveToward(e, e.x + (e.x - tgt.x), e.y + (e.y - tgt.y), step); // back off
        if (d <= def.range && d >= def.minRange * 0.8 && e.cooldown === 0) {
          state.shells.push({ x: tgt.x, y: tgt.y, fromX: e.x, fromY: e.y, t: def.flight, flight: def.flight, damage: def.damage, radius: def.splash });
          e.cooldown = def.interval;
        }
        break;
      default:
        break;
    }
  }

  updateShells(state, dt);

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
    // Nest children stay home; roaming enemies far behind are dropped.
    return e.nestId != null || e.x > behind;
  });
}

function updateShells(state, dt) {
  for (const s of state.shells) {
    s.t -= dt;
    if (s.t <= 0) {
      s.done = true;
      blastPlayer(state, s.x, s.y, s.radius, s.damage);
      addEffect(state, { kind: 'burst', x: s.x, y: s.y, r: s.radius, color: '#ff9f1a', ttl: 0.45 });
    }
  }
  state.shells = state.shells.filter((s) => !s.done);
}

// Nests: wake when the player comes close, then keep spawning their local enemies.
export function updateNests(state, dt) {
  const def = state.config.nest;
  const units = [...activeUnits(state), ...state.sentries.filter((s) => s.hp > 0)];
  const stationary = state.train.speed < 0.5;
  for (const n of state.nests) {
    if (n.hp <= 0) continue;
    n.hitFlash = Math.max(0, n.hitFlash - dt);
    const near = units.some((u) => dist(u.x, u.y, n.x, n.y) <= def.activationRadius);
    const trainNear = stationary && state.train.cars.some((_, i) => {
      const p = nearestPointOnCar(state, i, n.x, n.y);
      return dist(p.x, p.y, n.x, n.y) <= def.trainWakeRadius;
    });
    if (near || trainNear || n.hitFlash > 0) {
      if (!n.awake) pushMessage(state, 'A nest has woken up!', 'bad');
      n.awake = true;
      n.quiet = 0;
    } else if (n.awake) {
      // Left alone long enough, it settles down again.
      n.quiet = (n.quiet ?? 0) + dt;
      if (n.quiet >= def.sleepAfter) n.awake = false;
    }
    if (!n.awake) continue;
    n.timer -= dt;
    if (n.timer > 0) continue;
    n.timer = def.interval;
    const children = state.enemies.filter((e) => e.nestId === n.id).length;
    if (children >= def.maxChildren) continue;
    const type = n.types[Math.floor(state.rng() * n.types.length)];
    const count = type === 'swarmer' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const a = state.rng() * Math.PI * 2;
      spawnEnemy(state, type, n.x + Math.cos(a) * (n.radius + 10), n.y + Math.sin(a) * (n.radius + 10), { nestId: n.id });
    }
  }
  for (const n of state.nests) {
    if (n.hp > 0 || n.dead) continue;
    n.dead = true;
    state.stats.nestsDestroyed++;
    addEffect(state, { kind: 'burst', x: n.x, y: n.y, r: 70, color: def.color, ttl: 0.8 });
    pushMessage(state, `Nest destroyed — it left ${def.scrapReward} scrap`, 'good');
    state.nodes.push({ id: state.newId(), kind: 'scrap', x: n.x, y: n.y, amount: def.scrapReward, max: def.scrapReward, radius: 12 + Math.sqrt(def.scrapReward) * 2 });
  }
  state.nests = state.nests.filter((n) => !n.dead);
}
