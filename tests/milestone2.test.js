import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { TEST_LEVEL } from './fixtures.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelBurnPer100, ramDamage, nextBarricade } from '../src/sim/train.js';
import { moveCar, detachRear } from '../src/sim/consist.js';
import { orderUnit } from '../src/sim/units.js';

const DT = 1 / 60;
const LEVEL = TEST_LEVEL;

function game(mutate) {
  const config = structuredClone(CONFIG);
  const level = structuredClone(LEVEL);
  mutate?.(config, level);
  const s = createGame(config, level, { seed: 42 });
  s.spawnsEnabled = false;
  return s;
}

function run(state, seconds) {
  for (let t = 0; t < seconds; t += DT) step(state, DT);
}

const types = (s) => s.train.cars.map((c) => c.type);

function approach(s, barricade, gap = 60) {
  s.train.head = barricade.x - gap;
  s.train.speed = CONFIG.train.maxSpeed;
  setTrainRunning(s, true);
}

test('cars can be reordered only while stopped, and shunting holds the train', () => {
  const s = game();
  const tank = s.train.cars[2];
  assert.equal(moveCar(s, tank.id, -1).ok, true);
  assert.deepEqual(types(s), ['locomotive', 'fuelTank', 'turret']);
  assert.equal(moveCar(s, tank.id, -1).ok, false);
  setTrainRunning(s, true);
  run(s, CONFIG.reorder.secondsPerMove * 0.9);
  assert.equal(s.train.head, LEVEL.startX, 'train held while shunting');
  run(s, 2);
  assert.ok(s.train.head > LEVEL.startX);
  assert.equal(moveCar(s, tank.id, -1).ok, false, 'cannot reorder while moving');
});

test('ramming a barricade with the locomotive costs its full strength', () => {
  const s = game();
  const b = nextBarricade(s);
  const loco = s.train.cars[0];
  approach(s, b);
  run(s, 2);
  assert.equal(b.broken, true);
  assert.equal(loco.maxHp - loco.hp, b.strength);
});

test('a ram car at the front takes a fraction of the damage', () => {
  const s = game((c, l) => { l.defaultLoadout = ['ram', 'locomotive', 'turret']; });
  const b = nextBarricade(s);
  const ram = s.train.cars[0];
  const expected = Math.round(b.strength * CONFIG.cars.ram.ramDamageMultiplier);
  assert.equal(ramDamage(s, b), expected);
  approach(s, b);
  run(s, 2);
  assert.equal(b.broken, true);
  assert.equal(ram.maxHp - ram.hp, expected);
});

test('a reinforced barricade stops a train without a ram', () => {
  const s = game();
  const b = s.barricades.find((x) => x.reinforced);
  approach(s, b);
  run(s, 3);
  assert.equal(b.broken, false);
  assert.equal(s.train.blockedBy, b.id);
  assert.equal(s.train.cars[0].maxHp - s.train.cars[0].hp, CONFIG.barricade.reinforcedCrashDamage);
});

test('a ram car breaks a reinforced barricade', () => {
  const s = game((c, l) => { l.defaultLoadout = ['ram', 'locomotive']; });
  const b = s.barricades.find((x) => x.reinforced);
  approach(s, b);
  run(s, 2);
  assert.equal(b.broken, true);
});

test('a slow train is stopped by a barricade instead of breaking it', () => {
  const s = game();
  const b = nextBarricade(s);
  s.fuel = 0;
  approach(s, b, 5);
  s.train.speed = 0;
  run(s, 5);
  assert.equal(b.broken, false);
  assert.equal(s.train.blockedBy, b.id);
});

test('crew clearing a barricade by hand leave a scrap pile to haul', () => {
  const s = game();
  const b = nextBarricade(s);
  s.train.head = b.x - 40;
  const nodes = s.nodes.length;
  for (const c of s.crew) orderUnit(s, c.id, { type: 'work', kind: 'barricade', id: b.id });
  run(s, b.workNeeded / 2 + 6);
  assert.equal(b.broken, true);
  assert.equal(s.nodes.length, nodes + 1);
  assert.equal(s.nodes.at(-1).kind, 'scrap');
});

test('salvaging a wreck attaches its car at the rear, damaged', () => {
  const s = game();
  const w = s.wrecks.find((x) => x.carType === 'ram');
  s.train.head = w.x + 60;
  const burn = fuelBurnPer100(s);
  for (const c of s.crew) orderUnit(s, c.id, { type: 'work', kind: 'wreck', id: w.id });
  run(s, w.workNeeded / 2 + 6);
  assert.equal(w.done, true);
  const last = s.train.cars.at(-1);
  assert.equal(last.type, 'ram');
  assert.ok(last.hp < last.maxHp);
  assert.ok(fuelBurnPer100(s) > burn);
});

test('detaching drops the rear car, lowers fuel burn, and leaves a re-attachable wreck', () => {
  const s = game();
  const burn = fuelBurnPer100(s);
  setTrainRunning(s, true);
  run(s, 2);
  const res = detachRear(s);
  assert.equal(res.ok, true, 'allowed while moving');
  assert.equal(s.train.cars.length, 2);
  assert.ok(fuelBurnPer100(s) < burn);
  assert.equal(s.wrecks.at(-1).carType, res.car.type);
});

test('the locomotive cannot be detached', () => {
  const s = game((c, l) => { l.defaultLoadout = ['turret', 'locomotive']; });
  assert.equal(detachRear(s).ok, false);
});

test('rescuing a survivor adds a crew member who heads for the train', () => {
  const s = game();
  const sv = s.survivors[0];
  s.train.head = sv.x + 30;
  orderUnit(s, s.crew[0].id, { type: 'work', kind: 'survivor', id: sv.id });
  run(s, 12);
  assert.equal(sv.rescued, true);
  assert.equal(s.crew.length, 3);
  run(s, 15);
  assert.equal(s.crew[2].aboard, true);
});
