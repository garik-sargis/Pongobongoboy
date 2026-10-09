import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { LEVEL_1 } from '../src/level.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelBurnPer100, ramDamage, nextBarricade } from '../src/sim/train.js';
import { moveCar, detachRear } from '../src/sim/consist.js';
import { orderCrew } from '../src/sim/crew.js';

const DT = 1 / 60;

function game(mutate) {
  const config = structuredClone(CONFIG);
  const level = structuredClone(LEVEL_1);
  mutate?.(config, level);
  const s = createGame(config, level, 42);
  s.spawnsEnabled = false;
  return s;
}

function run(state, seconds) {
  for (let t = 0; t < seconds; t += DT) step(state, DT);
}

const types = (s) => s.train.cars.map((c) => c.type);

// Put the train just before a barricade at cruising speed.
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
  // Second move refused while shunting.
  assert.equal(moveCar(s, tank.id, -1).ok, false);
  setTrainRunning(s, true);
  run(s, CONFIG.reorder.secondsPerMove * 0.9);
  assert.equal(s.train.head, LEVEL_1.startX, 'train held while shunting');
  run(s, 2);
  assert.ok(s.train.head > LEVEL_1.startX, 'train departs once shunting ends');
  assert.equal(moveCar(s, tank.id, -1).ok, false, 'cannot reorder while moving');
});

test('reordering cannot move past either end', () => {
  const s = game();
  assert.equal(moveCar(s, s.train.cars[0].id, -1).ok, false);
  assert.equal(moveCar(s, s.train.cars[2].id, 1).ok, false);
});

test('ramming a barricade with the locomotive costs its full strength', () => {
  const s = game();
  const b = nextBarricade(s);
  const loco = s.train.cars[0];
  approach(s, b);
  run(s, 2);
  assert.equal(b.broken, true);
  assert.equal(loco.maxHp - loco.hp, b.strength);
  assert.ok(s.train.head > b.x);
});

test('a ram car at the front takes a fraction of the damage', () => {
  const s = game((c) => { c.train.startCars = ['ram', 'locomotive', 'turret']; });
  const b = nextBarricade(s);
  const ram = s.train.cars[0];
  const loco = s.train.cars[1];
  const expected = Math.round(b.strength * CONFIG.cars.ram.ramDamageMultiplier);
  assert.equal(ramDamage(s, b), expected);
  approach(s, b);
  run(s, 2);
  assert.equal(b.broken, true);
  assert.equal(ram.maxHp - ram.hp, expected);
  assert.equal(loco.hp, loco.maxHp);
});

test('a ram car not at the front gives no protection', () => {
  const s = game((c) => { c.train.startCars = ['locomotive', 'ram']; });
  const b = nextBarricade(s);
  assert.equal(ramDamage(s, b), b.strength);
});

test('a slow train is stopped by a barricade instead of breaking it', () => {
  const s = game();
  const b = nextBarricade(s);
  s.fuel = 0; // crawling is below the ram threshold
  approach(s, b, 5);
  s.train.speed = 0;
  run(s, 5);
  assert.equal(b.broken, false);
  assert.equal(s.train.head, b.x);
  assert.equal(s.train.blockedBy, b.id);
});

test('crew can clear a barricade by hand for scrap', () => {
  const s = game();
  const b = nextBarricade(s);
  s.train.head = b.x - 40;
  for (const c of s.crew) orderCrew(s, c.id, { type: 'work', kind: 'barricade', id: b.id });
  run(s, b.workNeeded / 2 + 6);
  assert.equal(b.broken, true);
  assert.ok(s.scrap > 0);
  assert.equal(s.train.cars[0].hp, s.train.cars[0].maxHp);
});

test('salvaging a wreck attaches its car at the rear, damaged', () => {
  const s = game();
  const w = s.wrecks.find((x) => x.carType === 'ram');
  s.train.head = w.x + 60;
  const burn = fuelBurnPer100(s);
  for (const c of s.crew) orderCrew(s, c.id, { type: 'work', kind: 'wreck', id: w.id });
  run(s, w.workNeeded / 2 + 6);
  assert.equal(w.done, true);
  const last = s.train.cars[s.train.cars.length - 1];
  assert.equal(last.type, 'ram');
  assert.ok(last.hp < last.maxHp);
  assert.ok(fuelBurnPer100(s) > burn, 'a heavier train burns more fuel');
});

test('salvage pauses while the train is far away', () => {
  const s = game();
  const w = s.wrecks[0];
  s.train.head = w.x + 2000;
  const c = s.crew[0];
  orderCrew(s, c.id, { type: 'work', kind: 'wreck', id: w.id });
  c.aboard = false;
  c.x = w.x;
  c.y = w.y + 40;
  run(s, w.workNeeded + 5);
  assert.equal(w.done, false);
  assert.equal(c.blocked, 'needTrain');
});

test('detaching drops the rear car, lowers fuel burn, and leaves a re-attachable wreck', () => {
  const s = game();
  const burn = fuelBurnPer100(s);
  setTrainRunning(s, true);
  run(s, 2);
  const wrecks = s.wrecks.length;
  const res = detachRear(s);
  assert.equal(res.ok, true, 'allowed while moving');
  assert.equal(s.train.cars.length, 2);
  assert.ok(fuelBurnPer100(s) < burn);
  assert.equal(s.wrecks.length, wrecks + 1);
  assert.equal(s.wrecks.at(-1).carType, res.car.type);
});

test('the locomotive cannot be detached', () => {
  const s = game((c) => { c.train.startCars = ['turret', 'locomotive']; });
  assert.equal(detachRear(s).ok, false);
});

test('rescuing a survivor adds a crew member who heads for the train', () => {
  const s = game();
  const sv = s.survivors[0];
  s.train.head = sv.x + 30;
  const c = s.crew[0];
  orderCrew(s, c.id, { type: 'work', kind: 'survivor', id: sv.id });
  run(s, 12);
  assert.equal(sv.rescued, true);
  assert.equal(s.crew.length, 3);
  const newbie = s.crew[2];
  assert.equal(newbie.name, sv.name);
  run(s, 15);
  assert.equal(newbie.aboard, true);
});
