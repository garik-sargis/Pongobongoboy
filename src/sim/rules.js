// Win / loss conditions.

import { aliveCrew } from './crew.js';

export function checkOutcome(state) {
  if (state.outcome) return state.outcome;
  const loco = state.train.cars.find((c) => c.type === 'locomotive');
  if (!loco || loco.hp <= 0) {
    return (state.outcome = { result: 'loss', reason: 'The locomotive was destroyed.' });
  }
  const alive = aliveCrew(state);
  if (alive.length === 0) {
    return (state.outcome = { result: 'loss', reason: 'Every crew member died.' });
  }
  if (state.train.head >= state.level.exitX) {
    const aboard = alive.filter((c) => c.aboard);
    if (aboard.length === 0) {
      return (state.outcome = { result: 'loss', reason: 'The train reached the tunnel with no crew aboard.' });
    }
    const left = alive.length - aboard.length;
    return (state.outcome = {
      result: 'win',
      reason: left > 0
        ? `You reached the tunnel, leaving ${left} crew member${left > 1 ? 's' : ''} behind.`
        : 'You reached the tunnel.',
    });
  }
  return null;
}
