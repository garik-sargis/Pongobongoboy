// Fog of war.
//   explored – a grid of cells you have ever seen (deposits, wrecks, nests there are known).
//   visible  – computed on demand from current vision sources (enemies are only shown when visible).

import { carRect } from './train.js';
import { activeUnits } from './units.js';

export function visionSources(state) {
  const f = state.config.fog;
  const out = [];
  state.train.cars.forEach((_, i) => {
    const r = carRect(state, i);
    out.push({ x: r.cx, y: r.cy, r: f.trainRadius });
  });
  for (const u of activeUnits(state)) out.push({ x: u.x, y: u.y, r: u.kind === 'vehicle' ? f.vehicleRadius : f.crewRadius });
  for (const s of state.sentries) if (s.hp > 0) out.push({ x: s.x, y: s.y, r: f.sentryRadius });
  return out;
}

export function isVisible(state, x, y, sources = visionSources(state)) {
  if (!state.fog.enabled) return true;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy <= s.r * s.r) return true;
  }
  return false;
}

export function isExplored(state, x, y) {
  const fog = state.fog;
  if (!fog.enabled) return true;
  const cx = Math.floor(x / fog.cell);
  const cy = Math.floor(y / fog.cell);
  if (cx < 0) return true;
  if (cx >= fog.cols || cy < 0 || cy >= fog.rows) return false;
  return fog.explored[cy * fog.cols + cx] === 1;
}

export function updateFog(state, dt) {
  const fog = state.fog;
  if (!fog.enabled) return;
  state.fogTimer -= dt;
  if (state.fogTimer > 0) return;
  state.fogTimer = 0.2;
  for (const s of visionSources(state)) reveal(fog, s.x, s.y, s.r);
}

export function reveal(fog, x, y, r) {
  const c = fog.cell;
  const x0 = Math.max(0, Math.floor((x - r) / c));
  const x1 = Math.min(fog.cols - 1, Math.floor((x + r) / c));
  const y0 = Math.max(0, Math.floor((y - r) / c));
  const y1 = Math.min(fog.rows - 1, Math.floor((y + r) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const px = (cx + 0.5) * c - x;
      const py = (cy + 0.5) * c - y;
      if (px * px + py * py <= r * r) fog.explored[cy * fog.cols + cx] = 1;
    }
  }
}
