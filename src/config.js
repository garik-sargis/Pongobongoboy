// All tuning numbers live here (and in src/data/). None of these values are design decisions;
// they are starting points for playtesting. Units: world pixels and seconds.
// Displayed distance uses 10 px = 1 m.

import { CARS, VEHICLES, SENTRY } from './data/cars.js';
import { ENEMIES, NEST } from './data/enemies.js';

export const CONFIG = {
  world: {
    height: 1400,      // default playable height; levels may override (track runs through the middle)
    pxPerMeter: 10,
  },

  camera: {
    defaultViewHeight: 760, // world units visible vertically at default zoom
    minViewHeight: 480,
    maxViewHeight: 1400,
  },

  // Fog of war: unexplored ground is black; explored-but-unwatched ground is dimmed and hides enemies.
  fog: {
    enabled: true,
    cell: 80,
    trainRadius: 420,
    crewRadius: 280,
    vehicleRadius: 330,
    sentryRadius: 240,
  },

  train: {
    maxSpeed: 70,               // px/s at full throttle with fuel
    accel: 30,                  // px/s^2
    decel: 45,                  // px/s^2
    crawlSpeedFraction: 0.15,   // out of fuel: train can still crawl at this fraction of maxSpeed
    carLength: 64,
    carGap: 10,
    carHeight: 34,
    maxCars: 8,                 // depot limit, locomotive included
    // Fuel burned per 100 px travelled = base + perCar * (sum of car weights, engine included).
    fuelPer100Base: 0.4,
    fuelPer100PerCar: 0.16,
    engineFuelCapacity: 40,     // capacity built into the locomotive
    startFuel: 45,
    startCars: ['locomotive', 'turret', 'fuelTank'], // fallback when a level has no loadout
  },

  cars: CARS,
  vehicles: VEHICLES,
  sentry: SENTRY,
  enemies: { ...ENEMIES, retargetInterval: 0.5, despawnBehind: 900 },
  nest: NEST,

  crew: {
    names: ['Ash', 'Brin'],
    hp: 40,
    speed: 50,                 // slower than the train: crew left outside get stranded
    radius: 9,
    range: 140,
    damage: 6,
    fireInterval: 0.8,
    gatherRate: 3,             // resource units per second while digging
    carry: 12,                 // units carried per trip back to the train
    interactRange: 22,         // distance from a site's edge to start working
    boardRange: 16,            // distance from the train to climb aboard / unload
    pauseGatherWhenFighting: true, // workers stop working to shoot back
  },

  // Car order (front -> back) can be changed only while stopped.
  reorder: {
    secondsPerMove: 1.5,       // shunting time per swap; the train cannot move meanwhile
  },

  barricade: {
    minRamSpeed: 20,           // out of fuel and slower than this: the train just stops against it
    speedAfterRam: 0.4,        // fraction of speed kept after smashing through
    clearWorkPerStrength: 0.2, // crew-seconds of work per point of strength to clear by hand
    scrapPerStrength: 0.25,    // size of the scrap pile left when cleared by hand
    reinforcedCrashDamage: 20, // a reinforced barricade without a ram stops the train and deals this
  },

  salvage: {
    work: 16,                  // crew-seconds to salvage a wreck into a working car
    reattachWork: 6,           // crew-seconds to re-attach a car you detached
    detachedOffset: 44,        // detached cars are shoved this far off the rails
    maxAttachDistance: 300,    // train must be stopped within this distance of a wreck to attach it
  },

  survivor: {
    hp: 35,
  },

  spawner: {
    baselineThreat: 8,         // threat drifts back to this while moving (levels override)
    risePerSecStopped: 2.0,    // threat gained per second while stationary (after grace)
    decayPerSecMoving: 6,      // threat lost per second while moving
    stopGrace: 3,              // seconds of stop before threat starts rising
    maxThreat: 100,
    intervalAtZero: 11,        // seconds between enemy groups at threat 0
    intervalAtMax: 1.2,        // seconds between enemy groups at max threat
    firstSpawnDelay: 8,
    groupSizeStep: 40,         // +1 enemy per group for every N threat (non-pack enemies)
    spawnDistance: [520, 720], // how far from the train enemies appear (they walk in from the fog)
    noSpawnNearExit: 500,
  },

  repair: {
    hpPerAction: 25,
    scrapCost: 10,
  },

  debug: {
    fuelGrant: 20,
    engineDamage: 25,
  },
};
