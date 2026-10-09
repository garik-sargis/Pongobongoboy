// Player weapons, shared by train cars, sentries, the tank and crew.
//   gun    – hitscan bullets, rapid, blocked by armour
//   cannon – slow shells with splash, ignore armour, may have a minimum range
//   flame  – continuous damage to every enemy within short range

import { addEffect, dist } from './state.js';
import { carRect } from './train.js';
import { findEnemyTarget, shoot, damageEnemy, splashEnemies } from './combat.js';

// holder: any object that keeps { cooldown, aim } between ticks. Returns true if it engaged something.
export function fireWeapon(state, holder, x, y, weapon, dt, { preferRushers = true } = {}) {
  holder.cooldown = Math.max(0, (holder.cooldown ?? 0) - dt);

  if (weapon.kind === 'flame') {
    let any = null;
    for (const e of [...state.enemies, ...state.nests]) {
      if (e.hp <= 0) continue;
      const reach = weapon.range + (e.kind === 'nest' ? e.radius : 0);
      if (dist(x, y, e.x, e.y) <= reach) {
        damageEnemy(state, e, weapon.dps * dt, { pierce: true });
        any = any ?? e;
      }
    }
    if (any) {
      holder.aim = Math.atan2(any.y - y, any.x - x);
      holder.flameT = (holder.flameT ?? 0) - dt;
      if (holder.flameT <= 0) {
        holder.flameT = 0.08;
        addEffect(state, { kind: 'flame', x, y, angle: holder.aim, range: weapon.range, ttl: 0.25 });
      }
    }
    return !!any;
  }

  const target = findEnemyTarget(state, x, y, weapon.range, { preferRushers, minRange: weapon.minRange ?? 0 });
  if (!target) return false;
  holder.aim = Math.atan2(target.y - y, target.x - x);
  if (holder.cooldown > 0) return true;
  holder.cooldown = weapon.interval;

  if (weapon.kind === 'cannon') {
    shoot(state, x, y, target.x, target.y, weapon.color, 3);
    splashEnemies(state, target.x, target.y, weapon.splash, weapon.damage);
    addEffect(state, { kind: 'burst', x: target.x, y: target.y, r: weapon.splash, color: weapon.color, ttl: 0.35 });
  } else {
    damageEnemy(state, target, weapon.damage);
    shoot(state, x, y, target.x, target.y, weapon.color);
  }
  return true;
}

export function updateCarWeapons(state, dt) {
  state.train.cars.forEach((car, i) => {
    const weapon = state.config.cars[car.type].weapon;
    if (!weapon || car.hp <= 0) return;
    const r = carRect(state, i);
    fireWeapon(state, car, r.cx, r.cy, weapon, dt);
  });
}

export function updateSentries(state, dt) {
  const def = state.config.sentry;
  for (const s of state.sentries) {
    if (s.hp <= 0) continue;
    s.hitFlash = Math.max(0, (s.hitFlash ?? 0) - dt);
    fireWeapon(state, s, s.x, s.y, def.weapon, dt);
  }
  state.sentries = state.sentries.filter((s) => s.hp > 0);
}

export function updateMines(state, dt) {
  // Mine stats come from the mine-layer definition even if the car is later lost.
  const def = state.config.cars.mineLayer.mines;
  for (const m of state.mines) {
    if (m.arm > 0) {
      m.arm -= dt;
      continue;
    }
    const hit = state.enemies.some((e) => e.hp > 0 && dist(m.x, m.y, e.x, e.y) <= def.trigger + state.config.enemies[e.type].radius);
    if (hit) {
      m.spent = true;
      splashEnemies(state, m.x, m.y, def.radius, def.damage);
      addEffect(state, { kind: 'burst', x: m.x, y: m.y, r: def.radius, color: '#c8d46a', ttl: 0.45 });
    }
  }
  state.mines = state.mines.filter((m) => !m.spent);
}
