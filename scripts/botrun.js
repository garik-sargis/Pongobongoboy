// Headless balance check: a naive bot plays the level across several seeds.
// Usage: node scripts/botrun.js [runs]
import { CONFIG } from '../src/config.js';
import { LEVEL_1 } from '../src/level.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelCapacity, repairCar } from '../src/sim/train.js';
import { orderCrew, recallAll, crewOutside } from '../src/sim/crew.js';

const DT = 1 / 60;
const runs = Number(process.argv[2]) || 10;
const LEAVE_THREAT = Number(process.env.LEAVE_THREAT) || 60;

function play(seed) {
  const s = createGame(CONFIG, LEVEL_1, seed);
  let mode = 'drive';
  let target = null;
  let stops = 0;
  setTrainRunning(s, true);
  while (!s.outcome && s.time < 1200) {
    if (mode === 'drive') {
      const want = s.fuel < fuelCapacity(s) * 0.7;
      const next = s.nodes.find((n) => n.amount > 0 && Math.abs(n.y - 300) < 160 && n.x > s.train.head - 30 && n.x < s.train.head + 60 &&
        (n.kind === 'scrap' || want));
      if (next) { target = next; setTrainRunning(s, false); mode = 'braking'; }
    } else if (mode === 'braking' && s.train.speed === 0) {
      for (const c of s.crew) orderCrew(s, c.id, { type: 'gather', nodeId: target.id });
      mode = 'work'; stops++;
    } else if (mode === 'work') {
      const done = target.amount <= 0 || (target.kind === 'fuel' && s.fuel >= fuelCapacity(s) - 0.5);
      if (done || s.threat > LEAVE_THREAT) { recallAll(s); mode = 'boarding'; }
      for (const car of s.train.cars) if (car.hp < car.maxHp - 25) repairCar(s, car.id);
    } else if (mode === 'boarding' && crewOutside(s).length === 0) {
      setTrainRunning(s, true); mode = 'drive';
    }
    step(s, DT);
  }
  const loco = s.train.cars[0];
  return { seed, result: s.outcome?.result ?? 'timeout', reason: s.outcome?.reason ?? '', time: s.time.toFixed(0), stops,
    loco: Math.round(loco.hp), crew: s.crew.filter((c) => c.alive).length, kills: s.stats.kills, maxFuelLeft: s.fuel.toFixed(0) };
}

for (let i = 0; i < runs; i++) console.log(JSON.stringify(play(100 + i)));
