// Shared combat helpers: target search and damage application.

import { dist, pushMessage, addEffect } from './state.js';

// Nearest living enemy within range. With preferRushers, any rusher in range
// beats any shooter (the "kill that one now" threat).
export function findEnemyTarget(state, x, y, range, preferRushers = false) {
  let best = null;
  let bestScore = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > range) continue;
    const score = preferRushers && e.type === 'rusher' ? d - 10000 : d;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

export function shoot(state, fromX, fromY, toX, toY, color) {
  addEffect(state, { kind: 'tracer', x1: fromX, y1: fromY, x2: toX, y2: toY, color, ttl: 0.12 });
}

export function damageEnemy(state, enemy, amount) {
  enemy.hp -= amount;
  enemy.hitFlash = 0.1;
}

export function damageCrew(state, member, amount) {
  if (!member.alive) return;
  member.hp -= amount;
  if (member.hp <= 0) {
    member.hp = 0;
    member.alive = false;
    member.order = null;
    pushMessage(state, `${member.name} was killed`, 'bad');
    addEffect(state, { kind: 'burst', x: member.x, y: member.y, r: 18, color: '#ffffff', ttl: 0.5 });
  }
}

export function damageCar(state, car, amount) {
  if (car.hp <= 0) return;
  car.hp = Math.max(0, car.hp - amount);
  car.hitFlash = 0.1;
  if (car.hp === 0 && car.type !== 'locomotive') {
    pushMessage(state, `${state.config.cars[car.type].label} disabled`, 'bad');
  }
}
