// Level 1: one contiguous stretch of track ending in an exit tunnel.
// Deposits are hand-placed so that driving straight through runs out of fuel,
// and so that there is a choice between near-track and riskier off-track sites.

export const LEVEL_1 = {
  name: 'Test Line',
  startX: 400,      // x of the front of the train at the start
  exitX: 12000,     // reaching this with the front of the train wins
  seed: 1234,
  nodes: [
    { kind: 'scrap', x: 2200, y: 420, amount: 30 },
    { kind: 'fuel',  x: 3200, y: 205, amount: 40 },
    { kind: 'scrap', x: 4600, y: 530, amount: 40 },   // far from the track
    { kind: 'fuel',  x: 5800, y: 70,  amount: 60 },   // far from the track, big
    { kind: 'scrap', x: 6900, y: 380, amount: 25 },
    { kind: 'fuel',  x: 7800, y: 390, amount: 35 },
    { kind: 'scrap', x: 9200, y: 150, amount: 30 },
    { kind: 'fuel',  x: 10000, y: 215, amount: 20 },
  ],
};
