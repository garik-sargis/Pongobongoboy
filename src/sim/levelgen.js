// Turns a level definition into placed deposits and nests.
// Deterministic for a given level seed. Deposits further from the track are richer,
// and every nest guards a rich pile, so exploring away from the train pays off but costs.

import { createRng } from './rng.js';

const MIN_GAP = 110;

export function generateLevel(level, world) {
  const rng = createRng((level.seed ?? 1) * 7919 + 13);
  const out = { nodes: [], nests: [] };
  const taken = [];
  const trackY = world.trackY;
  const clampY = (y) => Math.max(70, Math.min(world.height - 70, y));

  // Keep generated things off the track, away from each other and away from set pieces.
  for (const b of level.barricades ?? []) taken.push({ x: b.x, y: trackY });
  for (const w of level.wrecks ?? []) taken.push({ x: w.x, y: trackY + (w.dy ?? 0) });
  for (const s of level.survivors ?? []) taken.push({ x: s.x, y: trackY + (s.dy ?? 0) });

  // bias > 1 pulls placements toward the track.
  function place(from, to, minDist, maxDist, bias = 1.8) {
    for (let tries = 0; tries < 40; tries++) {
      const x = from + rng() * (to - from);
      const dist = minDist + Math.pow(rng(), bias) * Math.max(0, maxDist - minDist);
      const y = clampY(trackY + (rng() < 0.5 ? -1 : 1) * dist);
      if (taken.every((p) => Math.hypot(p.x - x, p.y - y) > MIN_GAP)) {
        taken.push({ x, y });
        return { x, y, dist: Math.abs(y - trackY) };
      }
    }
    return null;
  }

  function addNode(kind, p, amount) {
    out.nodes.push({ kind, x: Math.round(p.x), y: Math.round(p.y), amount: Math.max(8, Math.round(amount)) });
  }

  for (const z of level.zones ?? []) {
    const rich = z.richness ?? 1;
    const span = (z.to - z.from);
    for (const kind of ['fuel', 'scrap']) {
      const count = z[kind] ?? 0;
      for (let i = 0; i < count; i++) {
        // Stratify along the zone so deposits don't clump.
        const a = z.from + (span * i) / count;
        const p = place(a, a + span / count, 70, z.spread ?? 500);
        if (!p) continue;
        const base = kind === 'fuel' ? 30 : 20;
        addNode(kind, p, (base + p.dist * 0.07) * rich * (0.8 + rng() * 0.4));
      }
    }
    for (let i = 0; i < (z.nests ?? 0); i++) {
      const p = place(z.from + 300, z.to - 200, 380, Math.max(420, (z.spread ?? 500) + 60), 1);
      if (!p) continue;
      out.nests.push({ x: Math.round(p.x), y: Math.round(p.y), types: z.nestTypes ?? ['shooter'] });
      // A rich pile guarded by the nest.
      const angle = rng() * Math.PI * 2;
      const gx = p.x + Math.cos(angle) * 130;
      const gy = clampY(p.y + Math.sin(angle) * 130);
      taken.push({ x: gx, y: gy });
      addNode(rng() < 0.5 ? 'fuel' : 'scrap', { x: gx, y: gy }, 60 * rich + rng() * 20);
    }
  }
  return out;
}
