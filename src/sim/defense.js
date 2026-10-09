// Passive car modules: shield recharge, workshop auto-repair, crane auto-collect.

import { dist, addEffect } from './state.js';
import { carRect, isStationary, fuelCapacity } from './train.js';

export function updateCarModules(state, dt) {
  const cars = state.train.cars;
  const stopped = isStationary(state);
  cars.forEach((car, i) => {
    const def = state.config.cars[car.type];
    if (car.hp <= 0) {
      if (def.shield) car.shield = 0;
      return;
    }

    if (def.shield) {
      car.shieldIdle += dt;
      if (car.shieldIdle >= def.shield.delay) car.shield = Math.min(def.shield.capacity, car.shield + def.shield.regen * dt);
    }

    if (def.repair && stopped && state.scrap > 0) {
      // Repair the most damaged of: this car and its neighbours.
      const candidates = [cars[i - 1], car, cars[i + 1]].filter((c) => c && c.hp < c.maxHp);
      candidates.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      const target = candidates[0];
      if (target) {
        const hp = Math.min(def.repair.rate * dt, target.maxHp - target.hp, state.scrap / def.repair.scrapPerHp);
        target.hp += hp;
        state.scrap = Math.max(0, state.scrap - hp * def.repair.scrapPerHp);
        car.working = true;
      } else {
        car.working = false;
      }
    } else if (def.repair) {
      car.working = false;
    }

    if (def.crane) {
      car.craneTarget = null;
      if (!stopped) return;
      const r = carRect(state, i);
      let best = null;
      let bestD = Infinity;
      for (const n of state.nodes) {
        if (n.amount <= 0) continue;
        if (n.kind === 'fuel' && state.fuel >= fuelCapacity(state) - 0.01) continue;
        const d = dist(r.cx, r.cy, n.x, n.y) - n.radius;
        if (d <= def.crane.reach && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      if (!best) return;
      car.craneTarget = best.id;
      let take = Math.min(def.crane.rate * dt, best.amount);
      if (best.kind === 'fuel') {
        take = Math.min(take, fuelCapacity(state) - state.fuel);
        state.fuel += take;
        state.stats.fuelGathered += take;
      } else {
        state.scrap += take;
        state.stats.scrapGathered += take;
      }
      best.amount = Math.max(0, best.amount - take);
      car.craneT = (car.craneT ?? 0) - dt;
      if (car.craneT <= 0) {
        car.craneT = 0.6;
        addEffect(state, { kind: 'haul', x1: best.x, y1: best.y, x2: r.cx, y2: r.cy, color: best.kind === 'fuel' ? '#f0a531' : '#9aa3ab', ttl: 0.6 });
      }
    }
  });
}
