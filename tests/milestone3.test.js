import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { LEVELS } from '../src/data/levels.js';
import { TEST_LEVEL } from './fixtures.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, carRect } from '../src/sim/train.js';
import { orderUnit, deployVehicle, kitsAvailable } from '../src/sim/units.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { damageCar, damageUnit } from '../src/sim/combat.js';
import { isExplored, isVisible } from '../src/sim/fog.js';
import { generateLevel } from '../src/sim/levelgen.js';
import { createLoadout, addCar, loadoutRemaining, canAdd, removeCar } from '../src/sim/loadout.js';

const DT = 1 / 60;

function game(loadout, mutate) {
  const config = structuredClone(CONFIG);
  const level = structuredClone(TEST_LEVEL);
  if (loadout) level.defaultLoadout = loadout;
  mutate?.(config, level);
  const s = createGame(config, level, { seed: 7 });
  s.spawnsEnabled = false;
  return s;
}

function run(state, seconds) {
  for (let t = 0; t < seconds; t += DT) step(state, DT);
}

const carOf = (s, type) => s.train.cars.find((c) => c.type === type);
const rectOf = (s, type) => carRect(s, s.train.cars.findIndex((c) => c.type === type));

// --- Weapon cars ---------------------------------------------------------

test('cannon splash hits a group and ignores brute armour', () => {
  const s = game(['locomotive', 'cannon']);
  const r = rectOf(s, 'cannon');
  const a = spawnEnemy(s, 'brute', r.cx + 250, r.cy - 150);
  const b = spawnEnemy(s, 'brute', r.cx + 270, r.cy - 150);
  a.cooldown = b.cooldown = 1e9;
  run(s, 0.1);
  assert.ok(a.hp <= a.maxHp - CONFIG.cars.cannon.weapon.damage + 1);
  assert.ok(b.hp < b.maxHp, 'splash');
});

test('cannon cannot hit enemies inside its minimum range', () => {
  const s = game(['locomotive', 'cannon']);
  const r = rectOf(s, 'cannon');
  const e = spawnEnemy(s, 'shooter', r.cx, r.cy - 40);
  e.cooldown = 1e9;
  run(s, 3);
  assert.equal(e.hp, e.maxHp);
});

test('gun damage is reduced by brute armour', () => {
  const s = game(['locomotive', 'turret']);
  const r = rectOf(s, 'turret');
  const e = spawnEnemy(s, 'brute', r.cx + 100, r.cy - 150);
  e.cooldown = 1e9;
  run(s, 0.05);
  const per = CONFIG.cars.turret.weapon.damage - CONFIG.enemies.brute.armor;
  assert.equal(e.maxHp - e.hp, per);
});

test('flamer burns every enemy in range at once', () => {
  const s = game(['locomotive', 'flamer']);
  const r = rectOf(s, 'flamer');
  const pack = [0, 1, 2, 3, 4].map((i) => spawnEnemy(s, 'swarmer', r.cx - 40 + i * 20, r.cy - 70));
  for (const e of pack) e.cooldown = 1e9;
  run(s, 1);
  assert.equal(s.enemies.length, 0);
});

// --- Defence cars ------------------------------------------------------------

test('armour car reduces damage to its neighbours only', () => {
  const s = game(['locomotive', 'turret', 'armor', 'fuelTank', 'turret']);
  const [, t1, , tank, t2] = s.train.cars;
  damageCar(s, t1, 20);
  damageCar(s, tank, 20);
  damageCar(s, t2, 20);
  const red = 20 * (1 - CONFIG.cars.armor.adjacentReduction);
  assert.ok(Math.abs(t1.maxHp - t1.hp - red) < 1e-6);
  assert.ok(Math.abs(tank.maxHp - tank.hp - red) < 1e-6);
  assert.equal(t2.maxHp - t2.hp, 20);
});

test('shield bubble absorbs damage until depleted, then recharges', () => {
  const s = game(['locomotive', 'shield']);
  const loco = s.train.cars[0];
  const sh = carOf(s, 'shield');
  damageCar(s, loco, 50);
  assert.equal(loco.hp, loco.maxHp);
  assert.equal(sh.shield, CONFIG.cars.shield.shield.capacity - 50);
  damageCar(s, loco, 100);
  assert.equal(sh.shield, 0);
  assert.equal(loco.maxHp - loco.hp, 30);
  run(s, CONFIG.cars.shield.shield.delay + 2);
  assert.ok(sh.shield > 0);
});

test('mine layer drops mines only when it is the rear car, and mines kill chasers', () => {
  const rear = game(['locomotive', 'turret', 'mineLayer'], (c) => { c.cars.turret.weapon.damage = 0; });
  setTrainRunning(rear, true);
  run(rear, 10);
  assert.ok(rear.mines.length > 0);
  const m = rear.mines[0];
  const e = spawnEnemy(rear, 'swarmer', m.x - 5, m.y);
  e.cooldown = 1e9;
  run(rear, 0.2);
  assert.ok(e.hp <= 0 || !rear.enemies.includes(e));

  const front = game(['locomotive', 'mineLayer', 'turret']);
  setTrainRunning(front, true);
  run(front, 10);
  assert.equal(front.mines.length, 0);
});

// --- Utility cars ------------------------------------------------------------

test('crane pulls fuel from a nearby deposit straight into the train while stopped', () => {
  const s = game(['locomotive', 'crane', 'fuelTank']);
  const node = s.nodes.find((n) => n.kind === 'fuel' && Math.abs(n.y - 300) < 150);
  // Park the crane car right next to it.
  s.train.head = node.x + CONFIG.train.carLength * 1.5;
  const fuel0 = s.fuel;
  run(s, 5);
  assert.ok(s.fuel > fuel0 + 10);
  // Not while moving.
  const s2 = game(['locomotive', 'crane', 'fuelTank']);
  s2.train.head = node.x - 300;
  setTrainRunning(s2, true);
  const f2 = s2.fuel;
  run(s2, 6);
  assert.ok(s2.fuel < f2);
});

test('workshop repairs itself and its neighbours while stopped, spending scrap', () => {
  const s = game(['locomotive', 'turret', 'workshop', 'fuelTank', 'turret']);
  const [, t1, , tank, t2] = s.train.cars;
  t1.hp = 50;
  tank.hp = 50;
  t2.hp = 50;
  s.scrap = 100;
  run(s, 10);
  assert.ok(t1.hp > 50 && tank.hp > 50);
  assert.equal(t2.hp, 50, 'not adjacent');
  assert.ok(s.scrap < 100);
});

test('armoury: crew carry a kit out and build a sentry that shoots', () => {
  const s = game(['locomotive', 'armory']);
  const c = s.crew[0];
  const kits = kitsAvailable(s);
  assert.equal(kits, CONFIG.cars.armory.kits);
  assert.equal(orderUnit(s, c.id, { type: 'deploy', x: s.train.head + 100, y: 180 }).ok, true);
  run(s, 8);
  assert.equal(s.sentries.length, 1);
  assert.equal(kitsAvailable(s), kits - 1);
  const sentry = s.sentries[0];
  const e = spawnEnemy(s, 'shooter', sentry.x + 120, sentry.y - 60);
  e.cooldown = 1e9;
  run(s, 3);
  assert.ok(e.hp < e.maxHp);
});

test('a packed-up sentry kit goes back into the armoury', () => {
  const s = game(['locomotive', 'armory']);
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'deploy', x: s.train.head + 100, y: 180 });
  run(s, 8);
  const sentry = s.sentries[0];
  assert.equal(orderUnit(s, c.id, { type: 'work', kind: 'sentry', id: sentry.id }).ok, true);
  run(s, 5);
  assert.equal(s.sentries.length, 0);
  assert.equal(c.kit, true);
  orderUnit(s, c.id, { type: 'board' });
  run(s, 8);
  assert.equal(kitsAvailable(s), CONFIG.cars.armory.kits);
});

test('no armoury, no sentries', () => {
  const s = game(['locomotive', 'turret']);
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'deploy', x: s.train.head + 100, y: 180 });
  run(s, 6);
  assert.equal(s.sentries.length, 0);
  assert.equal(c.order, null);
});

// --- Vehicles ------------------------------------------------------------------

test('a tank needs a driver, fights, and docks back with its driver', () => {
  const s = game(['locomotive', 'tankBay']);
  const bay = carOf(s, 'tankBay');
  const res = deployVehicle(s, bay.id);
  assert.equal(res.ok, true);
  const tank = res.vehicle;
  const driver = s.crew.find((c) => c.inVehicle === tank.id);
  assert.ok(driver);
  const e = spawnEnemy(s, 'brute', tank.x + 150, tank.y + 40);
  e.cooldown = 1e9;
  run(s, 8);
  assert.ok(e.hp <= 0 || !s.enemies.includes(e), 'tank kills a brute');
  assert.equal(orderUnit(s, tank.id, { type: 'board' }).ok, true);
  run(s, 6);
  assert.equal(tank.deployed, false);
  assert.equal(driver.aboard, true);
  assert.equal(driver.inVehicle, null);
});

test('vehicle cannot deploy while moving or without crew aboard', () => {
  const s = game(['locomotive', 'tankBay']);
  const bay = carOf(s, 'tankBay');
  setTrainRunning(s, true);
  run(s, 2);
  assert.equal(deployVehicle(s, bay.id).ok, false);
  const s2 = game(['locomotive', 'tankBay']);
  for (const c of s2.crew) c.aboard = false;
  assert.equal(deployVehicle(s2, carOf(s2, 'tankBay').id).ok, false);
});

test('destroying a vehicle ejects its driver alive', () => {
  const s = game(['locomotive', 'tankBay']);
  const { vehicle } = deployVehicle(s, carOf(s, 'tankBay').id);
  const driver = s.crew.find((c) => c.inVehicle === vehicle.id);
  damageUnit(s, vehicle, vehicle.hp + 50);
  run(s, 0.1);
  assert.equal(vehicle.destroyed, true);
  assert.equal(driver.alive, true);
  assert.equal(driver.inVehicle, null);
  assert.equal(carOf(s, 'tankBay').vehicleId, null);
});

test('the excavator hauls much bigger loads than a person', () => {
  const s = game(['locomotive', 'excavatorBay']);
  const node = s.nodes.find((n) => n.kind === 'fuel' && n.amount >= 40);
  s.train.head = node.x + 60;
  const { vehicle } = deployVehicle(s, carOf(s, 'excavatorBay').id);
  orderUnit(s, vehicle.id, { type: 'work', kind: 'node', id: node.id });
  let max = 0;
  for (let i = 0; i < 60 * 20; i++) {
    step(s, DT);
    max = Math.max(max, vehicle.carry?.amount ?? 0);
  }
  assert.ok(max > CONFIG.crew.carry * 2);
});

test('the tank cannot dig', () => {
  const s = game(['locomotive', 'tankBay']);
  const { vehicle } = deployVehicle(s, carOf(s, 'tankBay').id);
  assert.equal(orderUnit(s, vehicle.id, { type: 'work', kind: 'node', id: s.nodes[0].id }).ok, false);
});

// --- Enemies -------------------------------------------------------------------

test('sniper aims (visible) before it fires, and prefers crew over cars', () => {
  const s = game(['locomotive'], (c) => {});
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'move', x: s.train.head, y: 150 });
  run(s, 4);
  const e = spawnEnemy(s, 'sniper', c.x + 250, c.y - 50);
  e.cooldown = 0;
  run(s, 0.5);
  assert.equal(e.target.kind, 'unit');
  assert.ok(e.aim > 0);
  assert.equal(c.hp, c.maxHp, 'not fired yet');
  run(s, CONFIG.enemies.sniper.aimTime + 0.2);
  assert.equal(c.hp, c.maxHp - CONFIG.enemies.sniper.damage);
});

test('mortar shells land after a delay at the marked spot', () => {
  const s = game(['locomotive']);
  const loco = s.train.cars[0];
  const e = spawnEnemy(s, 'mortar', s.train.head + 300, s.world.trackY - 200);
  e.cooldown = 0;
  run(s, 0.1);
  assert.equal(s.shells.length, 1);
  assert.equal(loco.hp, loco.maxHp);
  run(s, CONFIG.enemies.mortar.flight + 0.1);
  assert.ok(loco.hp < loco.maxHp);
});

test('brutes go for cars even with crew nearby', () => {
  const s = game(['locomotive']);
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'move', x: s.train.head + 200, y: 100 });
  run(s, 5);
  const e = spawnEnemy(s, 'brute', c.x + 150, c.y - 20);
  run(s, 0.1);
  assert.equal(e.target.kind, 'car');
});

// --- Nests -----------------------------------------------------------------------

test('a nest sleeps until a unit comes close, then spawns; destroying it leaves scrap', () => {
  const s = game(['locomotive'], (c, l) => { l.nests = [{ x: 1200, y: 80, types: ['shooter'] }]; });
  const nest = s.nests[0];
  run(s, 10);
  assert.equal(nest.awake, false);
  assert.equal(s.enemies.length, 0);
  const c = s.crew[0];
  orderUnit(s, c.id, { type: 'move', x: 900, y: 150 });
  run(s, 15);
  assert.equal(nest.awake, true);
  assert.ok(s.enemies.some((e) => e.nestId === nest.id));
  const nodes = s.nodes.length;
  nest.hp = 0;
  run(s, 0.1);
  assert.equal(s.nests.length, 0);
  assert.equal(s.nodes.length, nodes + 1);
});

// --- Fog -------------------------------------------------------------------------

test('fog: ground near the train is explored, far ground is not', () => {
  const s = game(['locomotive']);
  assert.equal(isExplored(s, s.train.head, s.world.trackY), true);
  assert.equal(isExplored(s, s.train.head + 3000, 50), false);
  assert.equal(isVisible(s, s.train.head + 3000, 50), false);
  setTrainRunning(s, true);
  run(s, 50);
  assert.equal(isExplored(s, s.train.head - 600, s.world.trackY), true, 'stays explored behind');
  assert.equal(isVisible(s, s.train.head - 1200, s.world.trackY), false, 'but not watched');
});

// --- Levels & loadout ---------------------------------------------------------------

test('level generation is deterministic and keeps things apart', () => {
  for (const level of LEVELS) {
    const world = { height: level.height, trackY: level.height / 2, length: level.exitX };
    const a = generateLevel(level, world);
    const b = generateLevel(level, world);
    assert.deepEqual(a, b);
    assert.ok(a.nodes.length >= 15, `${level.id} has deposits`);
    for (const n of a.nodes) {
      assert.ok(n.y > 0 && n.y < level.height);
      assert.ok(Math.abs(n.y - world.trackY) >= 60, 'off the track');
    }
  }
});

test('levels get harder', () => {
  const [easy, mid, hard] = LEVELS;
  assert.ok(easy.threat.riseMult < hard.threat.riseMult);
  assert.ok(easy.exitX < mid.exitX && mid.exitX < hard.exitX);
  const nests = (l) => l.zones.reduce((n, z) => n + (z.nests ?? 0), 0);
  assert.ok(nests(easy) < nests(mid) && nests(mid) < nests(hard));
});

test('depot: spending is capped by budget and leftovers become scrap', () => {
  const level = LEVELS[0];
  const lo = createLoadout(CONFIG, level);
  const left = loadoutRemaining(CONFIG, lo);
  assert.ok(left >= 0);
  assert.equal(canAdd(CONFIG, lo, 'locomotive').ok, false);
  while (addCar(CONFIG, lo, 'fuelTank').ok);
  assert.ok(loadoutRemaining(CONFIG, lo) < CONFIG.cars.fuelTank.cost || lo.cars.length === CONFIG.train.maxCars);
  assert.equal(removeCar(CONFIG, lo, lo.cars.indexOf('locomotive')).ok, false);
  const s = createGame(CONFIG, level, { loadout: lo.cars, scrap: loadoutRemaining(CONFIG, lo) });
  assert.equal(s.scrap, loadoutRemaining(CONFIG, lo));
  assert.deepEqual(s.train.cars.map((c) => c.type), lo.cars);
});

test('every level runs 3 minutes of stop-and-go with spawns and stays sane', () => {
  for (const level of LEVELS) {
    const s = createGame(CONFIG, level, { seed: 5 });
    for (let k = 0; k < 6 && !s.outcome; k++) {
      setTrainRunning(s, true);
      run(s, 15);
      setTrainRunning(s, false);
      run(s, 15);
    }
    const all = [...s.enemies, ...s.crew, ...s.vehicles, ...s.nodes];
    assert.ok(all.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y)), `${level.id}: positions finite`);
    assert.ok(Number.isFinite(s.fuel) && Number.isFinite(s.scrap) && Number.isFinite(s.threat));
  }
});
