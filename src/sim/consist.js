// Train composition: reorder, detach and attach cars.
// Reordering is abstracted (no shunting simulation): a swap is instant in
// position but locks the train in place for a short "shunting" time.

import { pushMessage, makeCar, makeWreck } from './state.js';
import { isStationary, carRect } from './train.js';

// dir: -1 = one step toward the front, +1 = one step toward the rear.
export function moveCar(state, carId, dir) {
  const cars = state.train.cars;
  const i = cars.findIndex((c) => c.id === carId);
  const j = i + dir;
  if (i < 0) return { ok: false, reason: 'No such car' };
  if (!isStationary(state)) return { ok: false, reason: 'Stop the train to rearrange cars' };
  if (state.train.shunting > 0) return { ok: false, reason: 'Still shunting…' };
  if (j < 0 || j >= cars.length) return { ok: false, reason: dir < 0 ? 'Already at the front' : 'Already at the rear' };
  [cars[i], cars[j]] = [cars[j], cars[i]];
  state.train.shunting = state.config.reorder.secondsPerMove;
  return { ok: true };
}

// Emergency drop of the rear car. Allowed while moving. The locomotive can't be dropped.
export function detachRear(state) {
  const cars = state.train.cars;
  if (cars.length < 2) return { ok: false, reason: 'Nothing to detach' };
  const car = cars[cars.length - 1];
  if (car.type === 'locomotive') return { ok: false, reason: 'Cannot detach the locomotive' };
  const r = carRect(state, cars.length - 1);
  cars.pop();
  const label = state.config.cars[car.type].label;
  makeWreck(state, car.type, r.cx, state.config.world.trackY + state.config.salvage.detachedOffset, car.hp, state.config.salvage.reattachWork);
  pushMessage(state, `${label} detached`, 'info');
  return { ok: true, car };
}

// A salvaged/re-attached car joins at the rear.
export function attachCar(state, type, hp) {
  const car = makeCar(state, type, hp);
  state.train.cars.push(car);
  pushMessage(state, `${state.config.cars[type].label} attached at the rear`, 'good');
  return car;
}
