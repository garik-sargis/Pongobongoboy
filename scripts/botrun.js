// Headless balance check: a simple bot plays each level across several seeds.
// Usage: node scripts/botrun.js [runs] [levelId]
// Env: LEAVE_THREAT (default 55) — threat level at which the bot recalls everyone and leaves.
//
// Strategy: drive; stop next to fuel when below 60% (and scrap when low); send all crew to
// haul; leave when the deposit is empty, tanks are full, or threat gets high. Dig out
// reinforced barricades when there is no ram in front. Repair while stopped.
import { CONFIG } from '../src/config.js';
import { LEVELS } from '../src/data/levels.js';
import { createGame, step } from '../src/sim/game.js';
import { setTrainRunning, fuelCapacity, fuelBurnPer100, repairCar, nextBarricade, ramOutcome, isStationary } from '../src/sim/train.js';
import { orderUnit, recallAll, activeUnits } from '../src/sim/units.js';

const DT = 1 / 60;
const runs = Number(process.argv[2]) || 5;
const only = process.argv[3];
const LEAVE_THREAT = Number(process.env.LEAVE_THREAT) || 55;

function play(level, seed) {
  const s = createGame(CONFIG, level, { seed });
  const trackY = s.world.trackY;
  let mode = 'drive';
  let target = null;
  let stops = 0;
  let skipUntil = 0;
  const reachable = (n) => n.amount > 0 && Math.abs(n.y - trackY) < 350;
  setTrainRunning(s, true);
  while (!s.outcome && s.time < 1500) {
    const head = s.train.head;
    if (mode === 'drive') {
      const b = nextBarricade(s);
      if (b && !ramOutcome(s, b).breaks && b.x - head < 80) {
        target = { kind: 'barricade', site: b };
        setTrainRunning(s, false);
        mode = 'braking';
      } else {
        // Top up if the fuel won't comfortably reach the next reachable fuel deposit after this one.
        const ahead = s.nodes.filter((n) => n.kind === 'fuel' && reachable(n) && n.x > head + 200).sort((a, b) => a.x - b.x)[0];
        const gap = (ahead ? ahead.x : s.world.length) - head;
        const need = Math.min(fuelCapacity(s) - 5, (gap / 100) * fuelBurnPer100(s) + 15);
        const wantFuel = (s.fuel < fuelCapacity(s) * 0.6 || s.fuel < need);
        const node = s.time > skipUntil && s.nodes.find((n) => reachable(n) && n.x > head - 40 && n.x < head + 60 &&
          ((n.kind === 'fuel' && wantFuel) || (n.kind === 'scrap' && s.scrap < 40 && Math.abs(n.y - trackY) < 220)));
        if (node) {
          target = { kind: 'node', site: node };
          setTrainRunning(s, false);
          mode = 'braking';
        }
      }
    } else if (mode === 'braking' && isStationary(s)) {
      for (const c of s.crew) if (c.alive) orderUnit(s, c.id, { type: 'work', kind: target.kind, id: target.site.id });
      mode = 'work';
      stops++;
    } else if (mode === 'work') {
      const site = target.site;
      const done = target.kind === 'barricade' ? site.broken
        : site.amount <= 0 || (site.kind === 'fuel' && s.fuel >= fuelCapacity(s) - 1);
      const tooHot = s.threat > LEAVE_THREAT && target.kind !== 'barricade';
      if (done || tooHot) {
        if (tooHot) skipUntil = s.time + 25;
        recallAll(s);
        mode = 'boarding';
      }
      for (const car of s.train.cars) if (car.hp < car.maxHp - 25) repairCar(s, car.id);
    } else if (mode === 'boarding' && activeUnits(s).length === 0) {
      setTrainRunning(s, true);
      mode = 'drive';
    }
    step(s, DT);
  }
  const loco = s.train.cars.find((c) => c.type === 'locomotive');
  return {
    level: level.id, seed, result: s.outcome?.result ?? 'timeout', reason: s.outcome?.reason ?? '',
    time: Math.round(s.time), stops, loco: Math.round(loco?.hp ?? 0), crew: s.crew.filter((c) => c.alive).length,
    kills: s.stats.kills, fuelLeft: Math.round(s.fuel), progress: `${Math.round((s.train.head / s.world.length) * 100)}%`,
  };
}

for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  for (let i = 0; i < runs; i++) console.log(JSON.stringify(play(level, 100 + i)));
}
