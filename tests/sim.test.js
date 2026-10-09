import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { LEVEL_1 } from '../src/level.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelBurnPer100, fuelCapacity, repairCar, carRect, isStationary } from '../src/sim/train.js';
import { orderCrew } from '../src/sim/crew.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { spawnInterval } from '../src/sim/spawner.js';

const DT = 1 / 60;

function game(mutate) {
  const config = structuredClone(CONFIG);
  const level = structuredClone(LEVEL_1);
  mutate?.(config, level);
  return createGame(config, level, 42);
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
  assert.equal(s.train.head, LEVEL_1.startX);
  assert.equal(s.fuel, fuel);
});

test('moving train advances and burns fuel in proportion to distance', () => {
  const s = quiet(game());
  setTrainRunning(s, true);
  const fuel0 = s.fuel;
  run(s, 10);
  const travelled = s.train.head - LEVEL_1.startX;
  assert.ok(travelled > 300);
  const expected = (travelled / 100) * fuelBurnPer100(s);
  assert.ok(Math.abs(fuel0 - s.fuel - expected) < 1e-6);
});

test('more cars burn more fuel', () => {
  const short = game((c) => { c.train.startCars = ['locomotive']; });
  const long = game((c) => { c.train.startCars = ['locomotive', 'turret', 'fuelTank', 'turret']; });
  assert.ok(fuelBurnPer100(long) > fuelBurnPer100(short));
});

test('at zero fuel the train crawls instead of stopping (no softlock)', () => {
  const s = quiet(game());
  s.fuel = 0;
  setTrainRunning(s, true);
  run(s, 20);
  const speed = s.train.speed;
  assert.ok(Math.abs(speed - CONFIG.train.maxSpeed * CONFIG.train.crawlSpeedFraction) < 1e-6);
  assert.ok(s.train.head > LEVEL_1.startX);
});

test('driving straight through without stopping runs out of fuel before the exit', () => {
  const s = quiet(game());
  const reach = LEVEL_1.startX + (s.fuel / fuelBurnPer100(s)) * 100;
  assert.ok(reach < LEVEL_1.exitX, `start fuel reaches ${reach}`);
});

test('threat rises while stopped and decays while moving', () => {
  const s = quiet(game());
  setTrainRunning(s, true);
  run(s, 1);
  setTrainRunning(s, false);
  run(s, 3); // decelerate
  const before = s.threat;
  run(s, 20);
  assert.ok(s.threat > before + 20, `threat ${before} -> ${s.threat}`);
  const high = s.threat;
  setTrainRunning(s, true);
  run(s, 8);
  assert.ok(s.threat < high);
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
  assert.equal(s.threat, CONFIG.spawner.baselineThreat);
});

test('crew cannot be deployed while the train is moving', () => {
  const s = quiet(game());
  setTrainRunning(s, true);
  run(s, 2);
  const res = orderCrew(s, s.crew[0].id, { type: 'move', x: s.train.head, y: 100 });
  assert.equal(res.ok, false);
  assert.ok(s.crew[0].aboard);
});

test('crew gather fuel into the tanks, capped at capacity', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'fuel');
  // Park the train next to the first fuel deposit.
  s.train.head = node.x + 40;
  const fuel0 = s.fuel;
  for (const c of s.crew) assert.equal(orderCrew(s, c.id, { type: 'work', kind: 'node', id: node.id }).ok, true);
  run(s, 30);
  assert.ok(s.fuel > fuel0);
  assert.ok(s.fuel <= fuelCapacity(s));
  assert.ok(node.amount < node.max);
});

test('gathering pauses while the worker is fighting', () => {
  const s = quiet(game());
  const node = s.nodes.find((n) => n.kind === 'scrap');
  s.train.head = node.x + 40;
  const c = s.crew[0];
  orderCrew(s, c.id, { type: 'work', kind: 'node', id: node.id });
  run(s, 6);
  assert.ok(s.scrap > 0, 'started gathering');
  const scrap = s.scrap;
  const enemy = spawnEnemy(s, 'shooter', c.x + 60, c.y);
  enemy.hp = 1e9; // keeps the fight going
  enemy.cooldown = 1e9; // harmless
  run(s, 2);
  assert.equal(s.scrap, scrap);
  assert.equal(c.blocked, 'fighting');
});

test('crew left outside are not carried along by the departing train', () => {
  const s = quiet(game());
  const c = s.crew[0];
  orderCrew(s, c.id, { type: 'move', x: LEVEL_1.startX, y: 150 });
  run(s, 5);
  setTrainRunning(s, true);
  run(s, 20);
  assert.equal(c.aboard, false);
  assert.ok(s.train.head - c.x > 500);
});

test('crew can walk back and board a stopped train', () => {
  const s = quiet(game());
  const c = s.crew[0];
  orderCrew(s, c.id, { type: 'move', x: LEVEL_1.startX - 30, y: 200 });
  run(s, 4);
  assert.equal(c.aboard, false);
  orderCrew(s, c.id, { type: 'board' });
  run(s, 6);
  assert.equal(c.aboard, true);
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
  const s = quiet(game((c) => { c.cars.turret.damage = 0; }));
  const loco = s.train.cars[0];
  spawnEnemy(s, 'rusher', s.train.head + 200, CONFIG.world.trackY);
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
  assert.equal(s.scrap, 100 - CONFIG.repair.scrapCost);
  setTrainRunning(s, true);
  run(s, 1);
  assert.equal(isStationary(s), false);
  assert.equal(repairCar(s, car.id).ok, false);
});

test('disabled fuel tank reduces capacity', () => {
  const s = quiet(game());
  const cap = fuelCapacity(s);
  s.train.cars.find((c) => c.type === 'fuelTank').hp = 0;
  assert.equal(fuelCapacity(s), cap - CONFIG.cars.fuelTank.fuelCapacity);
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
  assert.match(s.outcome.reason, /crew/i);
});

test('win when the front of the train reaches the exit with crew aboard', () => {
  const s = quiet(game());
  s.train.head = LEVEL_1.exitX - 5;
  s.fuel = 50;
  setTrainRunning(s, true);
  run(s, 3);
  assert.equal(s.outcome.result, 'win');
});

test('arriving with nobody aboard is a loss', () => {
  const s = quiet(game());
  s.train.head = LEVEL_1.exitX - 5;
  for (const c of s.crew) { c.aboard = false; c.x = 0; }
  setTrainRunning(s, true);
  run(s, 3);
  assert.equal(s.outcome.result, 'loss');
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
