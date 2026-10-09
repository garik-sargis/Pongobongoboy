// Crew: generalists who ride the train, and while it is stopped can be sent
// out to move, work at sites (gather, salvage, clear, rescue), and fight automatically.

import { moveToward, dist } from './state.js';
import { carRect, isStationary, nearestCarIndex, nearestPointOnCar } from './train.js';
import { findEnemyTarget, shoot, damageEnemy } from './combat.js';
import { getSite, siteActive, workSite } from './sites.js';

export function aliveCrew(state) {
  return state.crew.filter((c) => c.alive);
}

export function crewOutside(state) {
  return state.crew.filter((c) => c.alive && !c.aboard);
}

// Orders:
//   { type: 'move', x, y }
//   { type: 'work', kind: 'node'|'wreck'|'barricade'|'survivor', id }
//   { type: 'board' }
export function orderCrew(state, crewId, order) {
  const c = state.crew.find((m) => m.id === crewId);
  if (!c || !c.alive || state.outcome) return { ok: false, reason: 'Unavailable' };

  if (c.aboard) {
    if (order.type === 'board') return { ok: true };
    if (!isStationary(state)) {
      return { ok: false, reason: 'Stop the train to deploy crew' };
    }
    disembark(state, c, order);
  }
  c.order = order;
  c.blocked = null;
  return { ok: true };
}

export function recallAll(state) {
  for (const c of crewOutside(state)) c.order = { type: 'board' };
}

function orderTarget(state, order) {
  if (order.type === 'move') return { x: order.x, y: order.y };
  if (order.type === 'work') return getSite(state, order);
  return null;
}

// Step off the train on the side facing the destination.
function disembark(state, c, order) {
  const target = orderTarget(state, order) ?? { x: state.train.head, y: state.config.world.trackY + 1 };
  const { index } = nearestCarIndex(state, target.x, target.y);
  const r = carRect(state, index);
  const side = target.y < state.config.world.trackY ? -1 : 1;
  // Stagger by crew id so a group stepping off together doesn't stack.
  c.x = Math.max(r.x0, Math.min(r.x1, target.x)) + ((c.id % 3) - 1) * 14;
  c.y = state.config.world.trackY + side * (state.config.train.carHeight / 2 + state.config.crew.radius + 2);
  c.aboard = false;
}

// Where aboard crew are drawn: spread across the cars.
function seatPosition(state, crewIndex) {
  const cars = state.train.cars.length;
  const r = carRect(state, crewIndex % cars);
  const offset = (Math.floor(crewIndex / cars) - 0.5) * 12;
  return { x: r.cx + offset, y: r.cy };
}

export function updateCrew(state, dt) {
  const cfg = state.config.crew;
  const worldH = state.config.world.height;

  // Index loop: rescues can append crew mid-update.
  for (let idx = 0; idx < state.crew.length; idx++) {
    const c = state.crew[idx];
    if (!c.alive) continue;
    c.working = false;

    if (c.aboard) {
      const seat = seatPosition(state, idx);
      c.x = seat.x;
      c.y = seat.y;
      c.fighting = false;
      c.order = null;
      continue;
    }

    // Auto-fight: always shoot the nearest enemy in range (rushers first).
    c.cooldown = Math.max(0, c.cooldown - dt);
    const target = findEnemyTarget(state, c.x, c.y, cfg.range, true);
    c.fighting = !!target;
    if (target && c.cooldown === 0) {
      damageEnemy(state, target, cfg.damage);
      shoot(state, c.x, c.y, target.x, target.y, '#fff2c0');
      c.cooldown = cfg.fireInterval;
    }

    const step = cfg.speed * dt;
    const order = c.order;
    if (order) {
      if (order.type === 'move') {
        if (moveToward(c, order.x, order.y, step)) c.order = null;
      } else if (order.type === 'work') {
        updateWork(state, c, order, step, dt);
      } else if (order.type === 'board') {
        const { index } = nearestCarIndex(state, c.x, c.y);
        const p = nearestPointOnCar(state, index, c.x, c.y);
        if (dist(c.x, c.y, p.x, p.y) <= cfg.boardRange) {
          c.aboard = true;
          c.order = null;
        } else {
          moveToward(c, p.x, p.y, step);
        }
      }
    }

    c.y = Math.max(cfg.radius, Math.min(worldH - cfg.radius, c.y));
  }
}

function updateWork(state, c, order, step, dt) {
  const cfg = state.config.crew;
  const site = getSite(state, order);
  if (!siteActive(order.kind, site)) {
    c.order = null;
    c.blocked = null;
    return;
  }
  const reach = site.radius + cfg.interactRange;
  const d = dist(c.x, c.y, site.x, site.y);
  if (d > reach) {
    // Walk to the near edge of the site, fanned out a little per crew member so they don't stack.
    const angle = Math.atan2(c.y - site.y, c.x - site.x) + ((c.id % 4) - 1.5) * 0.45;
    const tx = site.x + Math.cos(angle) * (reach - 4);
    const ty = site.y + Math.sin(angle) * (reach - 4);
    moveToward(c, tx, ty, step);
    return;
  }
  const res = workSite(state, c, order.kind, site, dt);
  c.working = res.working;
  c.blocked = res.blocked;
  if (res.done) {
    c.order = null;
    c.blocked = null;
  }
}
