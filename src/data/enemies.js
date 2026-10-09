// Enemy roster. behavior picks the AI routine in sim/enemies.js.
// prefers: 'units' (crew/vehicles/sentries outside), 'cars', or omitted (nearest of anything).
// armor: flat damage reduction per hit (cannon shells, flames, mines and explosions ignore it).

export const ENEMIES = {
  shooter: {
    label: 'Shooter', behavior: 'ranged', hp: 30, speed: 34, radius: 9, color: '#cf4545',
    range: 130, damage: 5, interval: 1.3,
    blurb: 'Walks up and shoots the nearest crew member or car.',
  },
  rusher: {
    label: 'Rusher', behavior: 'rusher', hp: 16, speed: 115, radius: 8, color: '#ff3df0',
    damage: 30, blastRadius: 40,
    blurb: 'Fast, explodes on contact. Can catch a moving train. Kill it first.',
  },
  swarmer: {
    label: 'Swarmer', behavior: 'melee', hp: 7, speed: 92, radius: 5, color: '#d9e85a',
    damage: 2, interval: 0.6,
    blurb: 'Comes in packs of 5–8. Weak alone, nasty together. Flamers and mines love them.',
  },
  brute: {
    label: 'Brute', behavior: 'melee', hp: 170, armor: 4, speed: 24, radius: 15, color: '#9b4a35',
    damage: 22, interval: 1.4, prefers: 'cars',
    blurb: 'Slow, armoured (guns do little), smashes train cars. Use cannons, flamers or the tank.',
  },
  sniper: {
    label: 'Sniper', behavior: 'sniper', hp: 24, speed: 30, radius: 8, color: '#4fd1ff',
    range: 340, damage: 22, aimTime: 1.6, interval: 3.5, prefers: 'units',
    blurb: 'Hunts crew and vehicles from long range. Its laser shows who it is aiming at — move or break line.',
  },
  mortar: {
    label: 'Mortar', behavior: 'mortar', hp: 40, speed: 26, radius: 11, color: '#ff9f1a',
    range: 480, minRange: 160, damage: 28, splash: 55, flight: 1.7, interval: 4.5, prefers: 'cars',
    blurb: 'Shells you from far away. A ring marks where each shell will land. Punishes long stops.',
  },
};

export const NEST = {
  label: 'Nest', hp: 260, radius: 26, color: '#7d2f4f',
  activationRadius: 420,   // player units/sentries this close wake it
  trainWakeRadius: 520,    // a stopped train this close wakes it
  interval: 7,             // seconds between spawns while awake
  maxChildren: 6,
  leash: 750,              // its spawn won't chase targets further than this from the nest
  sleepAfter: 20,          // seconds with nobody near before it goes dormant again
  scrapReward: 50,
  blurb: 'Hostile nest out in the wilds. Wakes when you come close and keeps spawning. Destroy it for a big scrap pile.',
};
