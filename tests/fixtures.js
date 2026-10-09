// A small hand-placed level for tests: 600 tall (track at y=300), no generated zones.
export const TEST_LEVEL = {
  id: 'test',
  name: 'Test Line',
  exitX: 12000,
  height: 600,
  startX: 400,
  seed: 1234,
  startFuel: 45,
  crew: ['Ash', 'Brin'],
  budget: 0,
  defaultLoadout: ['locomotive', 'turret', 'fuelTank'],
  threat: { baseline: 8, riseMult: 1, intervalMult: 1 },
  nodes: [
    { kind: 'scrap', x: 2200, y: 420, amount: 30 },
    { kind: 'fuel', x: 3200, y: 205, amount: 40 },
    { kind: 'scrap', x: 4600, y: 530, amount: 40 },
    { kind: 'fuel', x: 5800, y: 70, amount: 60 },
    { kind: 'fuel', x: 7800, y: 390, amount: 35 },
  ],
  wrecks: [
    { carType: 'ram', x: 1700, y: 225, hpFraction: 0.5 },
    { carType: 'turret', x: 8400, y: 205, hpFraction: 0.6 },
  ],
  barricades: [
    { x: 4300, strength: 70 },
    { x: 9600, strength: 140, reinforced: true },
  ],
  survivors: [{ name: 'Cato', x: 5100, y: 480 }],
};
