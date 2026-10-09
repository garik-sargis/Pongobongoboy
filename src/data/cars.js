// Car catalogue. Every number is a playtest starting point, not a design decision.
// category: core | weapon | defense | utility | vehicle
// cost: price in scrap at the depot before a level.
// weight: adds to fuel burn (see CONFIG.train).

export const CARS = {
  locomotive: {
    label: 'Locomotive', short: 'Loco', category: 'core', hp: 220, weight: 1, cost: 0, color: '#e2b84b',
    role: 'Pulls the train. If it is destroyed, the run is over.',
  },
  fuelTank: {
    label: 'Fuel tank car', short: 'Tank car', category: 'utility', hp: 90, weight: 1, cost: 30, color: '#d9773b',
    role: 'Adds 60 fuel capacity. If disabled, its capacity (and fuel above the rest) is lost.',
    fuelCapacity: 60,
  },

  // --- Weapons ---
  turret: {
    label: 'Gun turret', short: 'Turret', category: 'weapon', hp: 100, weight: 1, cost: 40, color: '#5f9de0',
    role: 'Rapid-fire gun, medium range. Good all-rounder, shoots rushers first. Weak against armour.',
    weapon: { kind: 'gun', range: 240, damage: 8, interval: 0.45, color: '#9cc8ff' },
  },
  cannon: {
    label: 'Cannon car', short: 'Cannon', category: 'weapon', hp: 110, weight: 1.5, cost: 60, color: '#3f6699',
    role: 'Slow, long-range shells with splash that ignore armour. Can’t hit anything closer than 90.',
    weapon: { kind: 'cannon', range: 380, minRange: 90, damage: 40, splash: 50, interval: 2.2, pierce: true, color: '#ffd27a' },
  },
  flamer: {
    label: 'Flamer car', short: 'Flamer', category: 'weapon', hp: 130, weight: 1.2, cost: 45, color: '#c8553d',
    role: 'Burns every enemy within short range at once. Shreds swarms and brutes up close; useless at distance.',
    weapon: { kind: 'flame', range: 130, dps: 26, color: '#ff8a3d' },
  },

  // --- Defence ---
  armor: {
    label: 'Armour car', short: 'Armour', category: 'defense', hp: 300, weight: 2, cost: 40, color: '#70757d',
    role: 'Very tough and heavy. The cars directly in front of and behind it take 35% less damage.',
    adjacentReduction: 0.35,
  },
  shield: {
    label: 'Shield car', short: 'Shield', category: 'defense', hp: 100, weight: 1.2, cost: 70, color: '#7fd1d9',
    role: 'Projects a bubble that soaks up damage to anything inside it (cars, crew, sentries). Recharges after 3 s without hits.',
    shield: { radius: 175, capacity: 120, regen: 14, delay: 3 },
  },
  mineLayer: {
    label: 'Mine layer', short: 'Mines', category: 'defense', hp: 100, weight: 1, cost: 40, color: '#7a8450',
    role: 'Only works as the REAR car. Drops mines on the track behind a moving train. Wrecks anything chasing you.',
    mines: { spacing: 150, max: 10, damage: 50, radius: 60, trigger: 22, armTime: 0.6 },
  },

  // --- Utility ---
  crane: {
    label: 'Crane car', short: 'Crane', category: 'utility', hp: 110, weight: 1.4, cost: 45, color: '#d4c24a',
    role: 'While stopped, lifts fuel/scrap straight into the train from deposits within reach of THIS car. Stop in the right spot.',
    crane: { reach: 210, rate: 3.5 },
  },
  workshop: {
    label: 'Workshop car', short: 'Workshop', category: 'utility', hp: 110, weight: 1.3, cost: 50, color: '#b08d57',
    role: 'While stopped, repairs itself and the cars on either side, spending 1 scrap per 5 HP.',
    repair: { rate: 6, scrapPerHp: 0.2 },
  },
  armory: {
    label: 'Armoury car', short: 'Armoury', category: 'utility', hp: 100, weight: 1, cost: 45, color: '#8a6fb5',
    role: 'Holds 2 sentry-gun kits. Select crew and press B to carry one out and set it up. Pack it up again or abandon it.',
    kits: 2,
  },

  // --- Vehicle bays ---
  tankBay: {
    label: 'Tank bay', short: 'Tank bay', category: 'vehicle', hp: 140, weight: 2, cost: 90, color: '#556b2f',
    role: 'Carries a tank. A crew member drives it (deploy while stopped). Strong gun, armoured, faster than the train.',
    vehicle: 'tank',
  },
  excavatorBay: {
    label: 'Excavator bay', short: 'Digger bay', category: 'vehicle', hp: 120, weight: 1.8, cost: 65, color: '#c99a2e',
    role: 'Carries an excavator. A crew member drives it: digs ~3× faster than a person, hauls 40 per trip, clears barricades 4× faster.',
    vehicle: 'excavator',
  },

  ram: {
    label: 'Ram car', short: 'Ram', category: 'defense', hp: 150, weight: 1.5, cost: 35, color: '#9a9aa6',
    role: 'At the FRONT, takes barricade hits for 15% damage and smashes reinforced barricades. Does nothing anywhere else.',
    ramDamageMultiplier: 0.15,
  },
};

export const VEHICLES = {
  tank: {
    label: 'Tank', hp: 220, armor: 3, speed: 64, radius: 15, color: '#7a9a3a',
    weapon: { kind: 'cannon', range: 230, minRange: 0, damage: 20, splash: 32, interval: 1.0, pierce: true, color: '#ffd27a' },
    carry: 0, gatherRate: 0, workMultiplier: 1,
  },
  excavator: {
    label: 'Excavator', hp: 170, armor: 2, speed: 46, radius: 15, color: '#e0a92e',
    weapon: null,
    carry: 40, gatherRate: 7, workMultiplier: 4,
  },
};

export const SENTRY = {
  label: 'Sentry gun', hp: 90, radius: 11, deployTime: 2, packTime: 2, color: '#b49be0',
  weapon: { kind: 'gun', range: 200, damage: 7, interval: 0.4, color: '#d9c8ff' },
};
