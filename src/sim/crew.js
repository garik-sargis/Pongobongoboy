// Crew: generalists who ride the train, and while it is stopped can be sent
// out to move, gather fuel/scrap, and fight (automatically).

import { pushMessage, moveToward, dist } from './state.js';
import { carRect, isStationary, nearestCarIndex, nearestPointOnCar, fuelCapacity } from './train.js';
import { findEnemyTarget, shoot, damageEnemy } from './combat.js';

export function aliveCrew(state) {
  return state.crew.filter((c) => c.alive);
}

export function crewOutside(state) {
  return state.crew.filter((c) => c.alive && !c.aboard);
}

// Orders: { type: 'move', x, y } | { type: 'gather', nodeId } | { type: 'board' }
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
  if (order.type === 'gather') {
    const n = state.nodes.find((n) => n.id === order.nodeId);
    return n ? { x: n.x, y: n.y } : null;
  }
  return null;
}

// Step off the train on the side facing the destination.
function disembark(state, c, order) {
  const target = orderTarget(state, order) ?? { x: state.train.head, y: state.config.world.trackY + 1 };
  const { index } = nearestCarIndex(state, target.x, target.y);
  const r = carRect(state, index);
  const side = target.y < state.config.world.trackY ? -1 : 1;
  c.x = Math.max(r.x0, Math.min(r.x1, target.x));
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

  state.crew.forEach((c, idx) => {
    if (!c.alive) return;
    c.working = false;

    if (c.aboard) {
      const seat = seatPosition(state, idx);
      c.x = seat.x;
      c.y = seat.y;
      c.fighting = false;
      c.order = null;
      return;
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
    if (!order) return;

    if (order.type === 'move') {
      if (moveToward(c, order.x, order.y, step)) c.order = null;
    } else if (order.type === 'gather') {
      updateGather(state, c, order, step, dt);
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

    c.y = Math.max(cfg.radius, Math.min(worldH - cfg.radius, c.y));
  });
}

function updateGather(state, c, order, step, dt) {
  const cfg = state.config.crew;
  const node = state.nodes.find((n) => n.id === order.nodeId);
  if (!node || node.amount <= 0) {
    c.order = null;
    return;
  }
  const reach = node.radius + cfg.interactRange;
  if (dist(c.x, c.y, node.x, node.y) > reach) {
    // Walk to the near edge of the deposit.
    const d = dist(c.x, c.y, node.x, node.y);
    const tx = node.x + ((c.x - node.x) / d) * (reach - 4);
    const ty = node.y + ((c.y - node.y) / d) * (reach - 4);
    moveToward(c, tx, ty, step);
    return;
  }
  if (cfg.pauseGatherWhenFighting && c.fighting) {
    c.blocked = 'fighting';
    return;
  }

  let take = Math.min(cfg.gatherRate * dt, node.amount);
  if (node.kind === 'fuel') {
    const space = fuelCapacity(state) - state.fuel;
    if (space <= 0) {
      if (c.blocked !== 'full') pushMessage(state, 'Fuel tanks are full', 'info');
      c.blocked = 'full';
      return;
    }
    take = Math.min(take, space);
    state.fuel += take;
    state.stats.fuelGathered += take;
  } else {
    state.scrap += take;
    state.stats.scrapGathered += take;
  }
  c.blocked = null;
  c.working = true;
  node.amount -= take;
  if (node.amount <= 1e-6) {
    node.amount = 0;
    pushMessage(state, `${node.kind === 'fuel' ? 'Fuel' : 'Scrap'} deposit exhausted`, 'info');
    c.order = null;
  }
}
