// Headless balance check: a naive bot plays the level across several seeds.
// Usage: node scripts/botrun.js [runs] [--ram] [--far]
//   --ram   salvage the ram-car wreck and shunt it to the front before the barricades
//   --far   also stop for deposits far from the track
// Env: LEAVE_THREAT (default 60) — threat level at which the bot recalls crew and leaves.
import { CONFIG } from '../src/config.js';
import { LEVEL_1 } from '../src/level.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelCapacity, repairCar } from '../src/sim/train.js';
import { orderCrew, recallAll, crewOutside } from '../src/sim/crew.js';
import { moveCar } from '../src/sim/consist.js';

const DT = 1 / 60;
const runs = Number(process.argv[2]) || 10;
const useRam = process.argv.includes('--ram');
const reach = process.argv.includes('--far') ? 260 : 160;
const LEAVE_THREAT = Number(process.env.LEAVE_THREAT) || 60;

function play(seed) {
  const s = createGame(CONFIG, LEVEL_1, seed);
  let mode = 'drive';
  let target = null;
  let stops = 0;
  setTrainRunning(s, true);
  while (!s.outcome && s.time < 1200) {
    const head = s.train.head;
    if (mode === 'drive') {
      const want = s.fuel < fuelCapacity(s) * 0.7;
      const wreck = useRam && s.wrecks.find((w) => !w.done && w.carType === 'ram' && w.x > head - 30 && w.x < head + 60);
      const node = s.nodes.find((n) => n.amount > 0 && Math.abs(n.y - 300) < reach && n.x > head - 30 && n.x < head + 60 &&
        (n.kind === 'scrap' || want));
      const pick = wreck ? { kind: 'wreck', site: wreck } : node ? { kind: 'node', site: node } : null;
      if (pick) { target = pick; setTrainRunning(s, false); mode = 'braking'; }
    } else if (mode === 'braking' && s.train.speed === 0) {
      for (const c of s.crew) orderCrew(s, c.id, { type: 'work', kind: target.kind, id: target.site.id });
      mode = 'work'; stops++;
    } else if (mode === 'work') {
      const site = target.site;
      const done = target.kind === 'wreck' ? site.done
        : site.amount <= 0 || (site.kind === 'fuel' && s.fuel >= fuelCapacity(s) - 0.5);
      if (target.kind === 'wreck' && site.done) {
        const ram = s.train.cars.find((c) => c.type === 'ram');
        if (ram && s.train.cars[0] !== ram) moveCar(s, ram.id, -1);
      }
      const shuntingDone = target.kind !== 'wreck' || s.train.cars[0].type === 'ram';
      if ((done && shuntingDone) || s.threat > LEAVE_THREAT) { recallAll(s); mode = 'boarding'; }
      for (const car of s.train.cars) if (car.hp < car.maxHp - 25) repairCar(s, car.id);
    } else if (mode === 'boarding' && crewOutside(s).length === 0) {
      setTrainRunning(s, true); mode = 'drive';
    }
    step(s, DT);
  }
  const loco = s.train.cars.find((c) => c.type === 'locomotive');
  return { seed, result: s.outcome?.result ?? 'timeout', reason: s.outcome?.reason ?? '', time: Math.round(s.time), stops,
    loco: Math.round(loco.hp), crew: s.crew.filter((c) => c.alive).length, kills: s.stats.kills, fuelLeft: Math.round(s.fuel),
    train: s.train.cars.map((c) => c.type).join(',') };
}

for (let i = 0; i < runs; i++) console.log(JSON.stringify(play(100 + i)));
