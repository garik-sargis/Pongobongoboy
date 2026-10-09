// Level definitions. Deposits and nests are generated per zone (sim/levelgen.js) from the level seed,
// so a level is the same every time. Set pieces (barricades, wrecks, survivors) are hand-placed.
// dy = vertical offset from the track (negative = above).
//
// Zone fields: fuel/scrap = number of deposits, spread = max distance from the track,
// richness = amount multiplier, nests = number of nests, nestTypes = what they spawn.

export const LEVELS = [
  {
    id: 'valley',
    name: 'Green Valley',
    difficulty: 'Easy',
    blurb: 'A gentle first run. Plenty of fuel near the track, a few nests in the woods, two barricades. Three crew.',
    exitX: 13000,
    height: 1400,
    startX: 500,
    seed: 101,
    startFuel: 50,
    crew: ['Ash', 'Brin', 'Cato'],
    budget: 140,
    defaultLoadout: ['locomotive', 'turret', 'crane', 'fuelTank'],
    threat: { baseline: 6, riseMult: 0.9, intervalMult: 1.15 },
    enemyTable: [
      { type: 'shooter', weight: 5, minThreat: 0, group: [1, 2] },
      { type: 'rusher', weight: 2, minThreat: 0, group: [1, 1] },
      { type: 'swarmer', weight: 3, minThreat: 25, group: [4, 6] },
      { type: 'brute', weight: 1, minThreat: 60, group: [1, 1] },
    ],
    zones: [
      { from: 700, to: 4500, name: 'Meadows', fuel: 4, scrap: 4, spread: 450, richness: 1, nests: 0 },
      { from: 4500, to: 9000, name: 'Woods', fuel: 4, scrap: 4, spread: 600, richness: 1.1, nests: 2, nestTypes: ['shooter', 'swarmer'] },
      { from: 9000, to: 12600, name: 'Ridge', fuel: 3, scrap: 3, spread: 600, richness: 1, nests: 1, nestTypes: ['shooter', 'rusher'] },
    ],
    barricades: [
      { x: 3800, strength: 70 },
      { x: 10500, strength: 120 },
    ],
    wrecks: [
      { carType: 'ram', x: 2600, dy: -110, hpFraction: 0.5 },
      { carType: 'cannon', x: 7000, dy: 240, hpFraction: 0.6 },
    ],
    survivors: [
      { name: 'Dara', x: 6200, dy: -430 },
    ],
  },
  {
    id: 'ashflats',
    name: 'Ash Flats',
    difficulty: 'Medium',
    blurb: 'Stock up in the scrublands: the flats in the middle are barren and watched by snipers and brutes. A reinforced barricade blocks the way — bring a ram or dig.',
    exitX: 16000,
    height: 1400,
    startX: 500,
    seed: 202,
    startFuel: 60,
    crew: ['Ash', 'Brin'],
    budget: 180,
    defaultLoadout: ['locomotive', 'turret', 'cannon', 'fuelTank', 'crane'],
    threat: { baseline: 8, riseMult: 1, intervalMult: 1 },
    enemyTable: [
      { type: 'shooter', weight: 5, minThreat: 0, group: [1, 2] },
      { type: 'rusher', weight: 2, minThreat: 0, group: [1, 1] },
      { type: 'swarmer', weight: 3, minThreat: 20, group: [5, 7] },
      { type: 'brute', weight: 2, minThreat: 30, group: [1, 1] },
      { type: 'sniper', weight: 2, minThreat: 35, group: [1, 1] },
    ],
    zones: [
      { from: 700, to: 5500, name: 'Scrublands', fuel: 6, scrap: 5, spread: 550, richness: 1.1, nests: 1, nestTypes: ['shooter', 'swarmer'] },
      { from: 5500, to: 11500, name: 'Ash Flats', fuel: 3, scrap: 3, spread: 650, richness: 0.6, nests: 3, nestTypes: ['brute', 'sniper', 'shooter'] },
      { from: 11500, to: 15600, name: 'Old Depot', fuel: 5, scrap: 4, spread: 500, richness: 1, nests: 1, nestTypes: ['shooter', 'rusher'] },
    ],
    barricades: [
      { x: 5000, strength: 80 },
      { x: 9000, strength: 200, reinforced: true },
      { x: 13500, strength: 110 },
    ],
    wrecks: [
      { carType: 'ram', x: 3000, dy: 130, hpFraction: 0.5 },
      { carType: 'shield', x: 7600, dy: -320, hpFraction: 0.6 },
      { carType: 'tankBay', x: 12200, dy: 210, hpFraction: 0.6 },
    ],
    survivors: [
      { name: 'Eli', x: 4200, dy: 420 },
      { name: 'Fen', x: 10200, dy: -520 },
    ],
  },
  {
    id: 'hive',
    name: 'Hive Line',
    difficulty: 'Hard',
    blurb: 'The line runs through hive country. Nests everywhere, mortars shelling long stops, two reinforced barricades. Every stop must count.',
    exitX: 18000,
    height: 1400,
    startX: 500,
    seed: 303,
    startFuel: 60,
    crew: ['Ash', 'Brin'],
    budget: 260,
    defaultLoadout: ['locomotive', 'turret', 'armor', 'fuelTank', 'flamer', 'turret', 'mineLayer'],
    threat: { baseline: 12, riseMult: 1.2, intervalMult: 0.9 },
    enemyTable: [
      { type: 'shooter', weight: 4, minThreat: 0, group: [1, 3] },
      { type: 'rusher', weight: 3, minThreat: 0, group: [1, 2] },
      { type: 'swarmer', weight: 4, minThreat: 20, group: [5, 8] },
      { type: 'brute', weight: 2, minThreat: 25, group: [1, 2] },
      { type: 'sniper', weight: 2, minThreat: 30, group: [1, 1] },
      { type: 'mortar', weight: 2, minThreat: 40, group: [1, 1] },
    ],
    zones: [
      { from: 700, to: 5000, name: 'Outskirts', fuel: 5, scrap: 4, spread: 550, richness: 1, nests: 2, nestTypes: ['shooter', 'swarmer'] },
      { from: 5000, to: 12000, name: 'Hive Fields', fuel: 6, scrap: 5, spread: 650, richness: 1.3, nests: 5, nestTypes: ['swarmer', 'brute', 'mortar', 'sniper'] },
      { from: 12000, to: 17600, name: 'Burnt Pass', fuel: 4, scrap: 3, spread: 650, richness: 0.9, nests: 3, nestTypes: ['shooter', 'mortar', 'rusher'] },
    ],
    barricades: [
      { x: 4200, strength: 90 },
      { x: 8000, strength: 220, reinforced: true },
      { x: 11000, strength: 130 },
      { x: 15500, strength: 240, reinforced: true },
    ],
    wrecks: [
      { carType: 'excavatorBay', x: 2800, dy: -260, hpFraction: 0.6 },
      { carType: 'armory', x: 6500, dy: 320, hpFraction: 0.6 },
      { carType: 'ram', x: 7200, dy: 150, hpFraction: 0.5 },
      { carType: 'workshop', x: 9800, dy: -160, hpFraction: 0.6 },
    ],
    survivors: [
      { name: 'Gil', x: 5600, dy: -560 },
      { name: 'Hal', x: 13000, dy: 530 },
    ],
  },
];

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
