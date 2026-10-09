// All tuning numbers live here. None of these values are design decisions;
// they are starting points for playtesting. Units: world pixels and seconds.
// Displayed distance uses 10 px = 1 m.

export const CONFIG = {
  world: {
    height: 600,       // playable band height (track runs through the middle)
    trackY: 300,
    pxPerMeter: 10,
  },

  train: {
    maxSpeed: 70,               // px/s at full throttle with fuel
    accel: 30,                  // px/s^2
    decel: 45,                  // px/s^2
    crawlSpeedFraction: 0.15,   // out of fuel: train can still crawl at this fraction of maxSpeed
    carLength: 64,
    carGap: 10,
    carHeight: 34,
    // Fuel burned per 100 px travelled = base + perCar * (sum of car weights, engine included).
    fuelPer100Base: 0.4,
    fuelPer100PerCar: 0.2,
    engineFuelCapacity: 40,     // capacity built into the locomotive
    startFuel: 45,
    startCars: ['locomotive', 'turret', 'fuelTank'], // front to back
  },

  cars: {
    locomotive: {
      label: 'Locomotive',
      hp: 200,
      color: '#e2b84b',
      role: 'Pulls the train. If it is destroyed, the run is over.',
      weight: 1,
    },
    turret: {
      label: 'Turret car',
      hp: 100,
      color: '#5f9de0',
      role: 'Automatically shoots enemies in range. Prioritises rushers.',
      weight: 1,
      range: 230,
      damage: 8,
      fireInterval: 0.45,
    },
    fuelTank: {
      label: 'Fuel tank car',
      hp: 90,
      color: '#d9773b',
      role: 'Adds fuel capacity. If disabled, its capacity (and any fuel above the rest) is lost.',
      weight: 1,
      fuelCapacity: 60,
    },
    ram: {
      label: 'Ram car',
      hp: 150,
      color: '#9a9aa6',
      role: 'At the FRONT, takes barricade hits for a fraction of the damage. Does nothing anywhere else. Heavy.',
      weight: 1.5,
      ramDamageMultiplier: 0.15,
    },
  },

  // Car order (front -> back) can be changed only while stopped.
  reorder: {
    secondsPerMove: 1.5,       // shunting time per swap; the train cannot move meanwhile
  },

  barricade: {
    minRamSpeed: 20,           // slower than this and the train just stops against it
    speedAfterRam: 0.4,        // fraction of speed kept after smashing through
    clearWorkPerStrength: 0.2, // crew-seconds of work per point of strength to clear by hand
    scrapPerStrength: 0.15,    // scrap yielded when cleared by hand
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

  crew: {
    names: ['Ash', 'Brin'],
    hp: 40,
    speed: 45,                 // slower than the train: crew left outside get stranded
    radius: 9,
    range: 140,
    damage: 6,
    fireInterval: 0.8,
    gatherRate: 2,             // resource units per second per crew member
    interactRange: 22,         // distance from a deposit's edge to start working
    boardRange: 16,            // distance from the train to climb aboard
    pauseGatherWhenFighting: true, // open question 6: workers stop working to shoot back
  },

  enemies: {
    shooter: {
      label: 'Shooter',
      hp: 30,
      speed: 34,
      radius: 9,
      range: 120,
      damage: 5,
      fireInterval: 1.3,
      color: '#cf4545',
    },
    rusher: {
      label: 'Rusher',
      hp: 16,
      speed: 115,              // faster than the train: can catch it from behind
      radius: 8,
      damage: 30,              // explodes on contact
      blastRadius: 40,
      color: '#ff3df0',
    },
    retargetInterval: 0.5,
    despawnBehind: 700,        // removed when this far behind the last car
  },

  spawner: {
    baselineThreat: 8,         // threat level drifts back to this while moving
    risePerSecStopped: 2.0,    // threat gained per second while stationary (after grace)
    decayPerSecMoving: 6,      // threat lost per second while moving
    stopGrace: 3,              // seconds of stop before threat starts rising
    maxThreat: 100,
    intervalAtZero: 11,        // seconds between enemy groups at threat 0
    intervalAtMax: 1.0,        // seconds between enemy groups at max threat
    firstSpawnDelay: 8,
    rusherChanceMin: 0.08,
    rusherChanceMax: 0.4,
    groupSizeStep: 35,         // +1 enemy per group for every N threat
    noSpawnNearExit: 400,      // px before the exit where nothing new spawns
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
