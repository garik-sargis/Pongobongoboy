// Depot: before a level you spend the level's scrap budget on cars.
// Whatever you don't spend comes with you as scrap (for repairs on the way).

export function createLoadout(config, level) {
  const cars = [...(level.defaultLoadout ?? config.train.startCars)];
  return { cars, budget: level.budget ?? 0 };
}

export function loadoutCost(config, loadout) {
  return loadout.cars.reduce((n, t) => n + (config.cars[t].cost ?? 0), 0);
}

export function loadoutRemaining(config, loadout) {
  return loadout.budget - loadoutCost(config, loadout);
}

export function loadoutWeight(config, loadout) {
  return loadout.cars.reduce((n, t) => n + (config.cars[t].weight ?? 1), 0);
}

export function loadoutBurn(config, loadout) {
  return config.train.fuelPer100Base + config.train.fuelPer100PerCar * loadoutWeight(config, loadout);
}

export function canAdd(config, loadout, type) {
  if (type === 'locomotive') return { ok: false, reason: 'Only one locomotive' };
  if (loadout.cars.length >= config.train.maxCars) return { ok: false, reason: `Max ${config.train.maxCars} cars` };
  if (loadoutRemaining(config, loadout) < config.cars[type].cost) return { ok: false, reason: 'Not enough scrap' };
  return { ok: true };
}

// New cars go to the rear — but in front of a mine layer, which only works as the last car.
export function addCar(config, loadout, type) {
  const res = canAdd(config, loadout, type);
  if (!res.ok) return res;
  const last = loadout.cars.length - 1;
  if (type !== 'mineLayer' && last > 0 && config.cars[loadout.cars[last]].mines) loadout.cars.splice(last, 0, type);
  else loadout.cars.push(type);
  return res;
}

export function removeCar(config, loadout, index) {
  if (loadout.cars[index] === 'locomotive') return { ok: false, reason: 'The locomotive stays' };
  loadout.cars.splice(index, 1);
  return { ok: true };
}

// dir: -1 toward the front, +1 toward the rear.
export function shiftCar(loadout, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= loadout.cars.length) return { ok: false };
  [loadout.cars[index], loadout.cars[j]] = [loadout.cars[j], loadout.cars[index]];
  return { ok: true };
}
