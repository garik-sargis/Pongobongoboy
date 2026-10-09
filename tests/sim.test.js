import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { TEST_LEVEL } from './fixtures.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelBurnPer100, fuelCapacity, repairCar, carRect, isStationary } from '../src/sim/train.js';
import { orderUnit } from '../src/sim/units.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { spawnInterval } from '../src/sim/spawner.js';

const DT = 1 / 60;
const LEVEL = TEST_LEVEL;

function game(mutate) {
  const config = structuredClone(CONFIG);
  const level = structuredClone(LEVEL);
  mutate?.(config, level);
  return createGame(config, level, { seed: 42 });
}

function run(state, seconds) {
  for (let t = 0; t < seconds; t += DT) step(state, DT);
}

function quiet(state) {
  state.spawnsEnabled = false;
  return state;
}

test('stopped train does not move or burn fuel', () => {
  const s = quiet(game());
  const fuel = s.fuel;
  run(s, 5);
  assert.equal(s.train.head, LEVEL.startX);
  assert.equal(s.fuel, fuel);
});

test('moving train advances and burns fuel in proportion to distance', () => {
  const s = quiet(game());
  setTrainRunning(s, true);
  const fuel0 = s.fuel;
  run(s, 10);
  const travelled = s.train.head - LEVEL.startX;
  assert.ok(travelled > 300);
  const expected = (travelled / 100) * fuelBurnPer100(s);
  assert.ok(Math.abs(fuel0 - s.fuel - expected) < 1e-6);
});

test('more (and heavier) cars burn more fuel', () => {
  const short = game((c, l) => { l.defaultLoadout = ['locomotive']; });
  const long = game((c, l) => { l.defaultLoadout = ['locomotive', 'turret', 'fuelTank', 'turret']; });
  const heavy = game((c, l) => { l.defaultLoadout = ['locomotive', 'armor', 'fuelTank', 'turret']; });
  assert.ok(fuelBurnPer100(long) > fuelBurnPer100(short));
  assert.ok(fuelBurnPer100(heavy) > fuelBurnPer100(long));
});

test('at zero fuel the train crawls instead of stopping (no softlock)', () => {
  const s = quiet(game());
  s.fuel = 0;
  setTrainRunning(s, true);
  run(s, 20);
  assert.ok(Math.abs(s.train.speed - CONFIG.train.maxSpeed * CONFIG.train.crawlSpeedFraction) < 1e-6);
  assert.ok(s.train.head > LEVEL.startX);
});

test('threat rises while stopped and decays while moving', () => {
  const s = quiet(game());
  setTrainRunning(s, true);
  run(s, 1);
  setTrainRunning(s, false);
  run(s, 3);
  const before = s.threat;
  run(s, 20);
  assert.ok(s.threat > before + 20, `threat ${before} -> ${s.threat}`);
  const high = s.threat;
  setTrainRunning(s, true);
  run(s, 8);
  assert.ok(s.threat < high);
});

test('level threat modifiers change the escalation rate', () => {
  const calm = quiet(game((c, l) => { l.threat.riseMult = 0.5; }));
  const angry = quiet(game((c, l) => { l.threat.riseMult = 2; }));
  for (const s of [calm, angry]) {
    setTrainRunning(s, true);
    run(s, 0.5);
    setTrainRunning(s, false);
    run(s, 20);
  }
  assert.ok(angry.threat > calm.threat + 15);
});

test('spawn interval shrinks as threat grows', () => {
  const s = game();
  s.threat = 0;
  const calm = spawnInterval(s);
  s.threat = 100;
  assert.ok(spawnInterval(s) < calm / 5);
});

test('spawner is idle until the train first departs', () => {
  const s = game();
  run(s, 30);
  assert.equal(s.enemies.length, 0);
});

test('crew cannot be deployed while the train is moving', () => {
  const s = quiet(game());
  setTrainRunning(s, true);
  run(s, 2);
  const res = orderUnit(s, s.crew[0].id, { type: 'move', x: s.train.head, y: 100 });
  assert.equal(res.ok, false);
  assert.ok(s.crew[0].aboard);
});

test('crew haul fuel in loads: nothing arrives until a load is carried back', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'fuel');
  s.train.head = node.x + 40;
  const c = s.crew[0];
  const fuel0 = s.fuel;
  assert.equal(orderUnit(s, c.id, { type: 'work', kind: 'node', id: node.id }).ok, true);
  // Dig until carrying something but not yet back.
  for (let i = 0; i < 600 && !(c.carry && c.carry.amount > 3); i++) step(s, DT);
  assert.ok(c.carry.amount > 3, 'digging into a load');
  assert.equal(s.fuel, fuel0, 'fuel not in the tanks yet');
  run(s, 25);
  assert.ok(s.fuel > fuel0, 'load delivered');
  assert.ok(node.amount < node.max);
});

test('a load is at most the unit carry capacity', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'fuel' && n.amount > CONFIG.crew.carry);
  s.train.head = node.x + 40;
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'work', kind: 'node', id: node.id });
  let max = 0;
  for (let i = 0; i < 60 * 40; i++) {
    step(s, DT);
    max = Math.max(max, c.carry?.amount ?? 0);
  }
  assert.ok(max <= CONFIG.crew.carry + 1e-6);
  assert.ok(max > CONFIG.crew.carry - 0.5);
});

test('fuel is capped at capacity; a worker waits with the leftover load', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'fuel');
  s.train.head = node.x + 40;
  s.fuel = fuelCapacity(s) - 2;
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'work', kind: 'node', id: node.id });
  run(s, 30);
  assert.equal(s.fuel, fuelCapacity(s));
  assert.equal(c.blocked, 'full');
});

test('gathering pauses while the worker is fighting', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'scrap');
  s.train.head = node.x + 40;
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'work', kind: 'node', id: node.id });
  for (let i = 0; i < 1200 && !(c.carry && c.carry.amount > 1); i++) step(s, DT);
  const load = c.carry.amount;
  const enemy = spawnEnemy(s, 'shooter', c.x + 60, c.y);
  enemy.hp = 1e9;
  enemy.cooldown = 1e9;
  run(s, 2);
  assert.equal(c.carry.amount, load);
  assert.equal(c.blocked, 'fighting');
});

test('boarding unloads whatever the unit carries', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'scrap');
  s.train.head = node.x + 40;
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'work', kind: 'node', id: node.id });
  for (let i = 0; i < 1200 && !(c.carry && c.carry.amount > 4); i++) step(s, DT);
  const load = c.carry.amount;
  orderUnit(s, c.id, { type: 'board' });
  run(s, 15);
  assert.equal(c.aboard, true);
  assert.ok(s.scrap >= load - 1e-6);
});

test('crew left outside are not carried along by the departing train', () => {
  const s = quiet(game());
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'move', x: LEVEL.startX, y: 150 });
  run(s, 5);
  setTrainRunning(s, true);
  run(s, 20);
  assert.equal(c.aboard, false);
  assert.ok(s.train.head - c.x > 500);
});

test('turret kills an enemy in range', () => {
  const s = quiet(game());
  const r = carRect(s, s.train.cars.findIndex((c) => c.type === 'turret'));
  spawnEnemy(s, 'shooter', r.cx, r.cy - 150);
  run(s, 4);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.stats.kills, 1);
});

test('rusher explodes on contact and damages the train', () => {
  const s = quiet(game((c) => { c.cars.turret.weapon.damage = 0; }));
  const loco = s.train.cars[0];
  spawnEnemy(s, 'rusher', s.train.head + 200, s.world.trackY);
  run(s, 4);
  assert.equal(s.enemies.length, 0);
  assert.ok(loco.hp < loco.maxHp);
});

test('repair spends scrap and only works while stopped', () => {
  const s = quiet(game());
  const car = s.train.cars[1];
  car.hp = 10;
  s.scrap = 100;
  assert.equal(repairCar(s, car.id).ok, true);
  assert.equal(car.hp, 10 + CONFIG.repair.hpPerAction);
  setTrainRunning(s, true);
  run(s, 1);
  assert.equal(isStationary(s), false);
  assert.equal(repairCar(s, car.id).ok, false);
});

test('loss when the locomotive is destroyed', () => {
  const s = quiet(game());
  s.train.cars[0].hp = 0;
  step(s, DT);
  assert.equal(s.outcome.result, 'loss');
  assert.match(s.outcome.reason, /locomotive/i);
});

test('loss when every crew member dies, even with the locomotive intact', () => {
  const s = quiet(game());
  for (const c of s.crew) c.alive = false;
  step(s, DT);
  assert.equal(s.outcome.result, 'loss');
});

test('win when the front of the train reaches the exit with crew aboard', () => {
  const s = quiet(game());
  s.train.head = LEVEL.exitX - 5;
  s.fuel = 50;
  setTrainRunning(s, true);
  run(s, 3);
  assert.equal(s.outcome.result, 'win');
});

test('a full run with spawns enabled is deterministic for a given seed', () => {
  const play = () => {
    const s = game();
    setTrainRunning(s, true);
    run(s, 40);
    setTrainRunning(s, false);
    run(s, 30);
    return [s.train.head, s.threat, s.enemies.length, s.stats.kills, s.train.cars.map((c) => c.hp)].join();
  };
  assert.equal(play(), play());
});
