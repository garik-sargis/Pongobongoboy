// Canvas renderer. Gray-box placeholder shapes only; reads sim state, never mutates it.

import { createRng } from '../sim/rng.js';
import { carRect, trainTail, ramOutcome } from '../sim/train.js';
import { getSite } from '../sim/sites.js';
import { visionSources, isVisible, isExplored } from '../sim/fog.js';
import { activeUnits, unitStats } from '../sim/units.js';

const COLORS = {
  ground: '#33342c',
  groundFar: '#2a2b24',
  bed: '#4a463d',
  tie: '#5d4c3b',
  rail: '#a9a397',
  fuel: '#f0a531',
  scrap: '#9aa3ab',
  crew: '#f1ead8',
  crewRing: '#3fb6a8',
  select: '#ffe066',
  hpGood: '#6fd16f',
  hpMid: '#e6c84a',
  hpBad: '#e45a4a',
  disabled: '#55534d',
  tunnel: '#1a1916',
  text: '#e9e4d6',
  fog: '#0d0d0b',
  kit: '#b49be0',
};

export function createRenderer(canvas, minimap) {
  const ctx = canvas.getContext('2d');
  const mctx = minimap.getContext('2d');
  let decorations = null;
  let decoFor = null;
  let dpr = 1;
  let minimapT = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    for (const c of [canvas, minimap]) {
      const w = Math.max(1, Math.floor(c.clientWidth * dpr));
      const h = Math.max(1, Math.floor(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
  }

  function render(state, ui, cam, time) {
    resize();
    if (decoFor !== state.level) {
      decorations = makeDecorations(state);
      decoFor = state.level;
    }
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.fog;
    ctx.fillRect(0, 0, W, H);

    const sources = visionSources(state);
    const visible = (x, y) => isVisible(state, x, y, sources);

    // World space.
    const k = dpr * cam.scale;
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    const view = { x0: cam.x - 60, x1: cam.x + cam.viewW + 60, y0: cam.y - 60, y1: cam.y + cam.viewH + 60 };
    // Terrain and things out in the wilds sit under the fog...
    drawGround(ctx, state, view);
    drawDecorations(ctx, decorations, view);
    drawNodes(ctx, state, ui, view);
    drawWrecks(ctx, state, ui, view);
    drawSurvivors(ctx, state, ui, view, time);
    drawNests(ctx, state, ui, view, time);
    drawMines(ctx, state, view, time);
    drawFog(ctx, state, view, sources);
    // ...the railway is always known (you can see down the line), as is everything of ours.
    drawTrack(ctx, state, view);
    drawDistanceMarkers(ctx, state, view);
    drawShieldBubbles(ctx, state);
    drawTunnelBack(ctx, state);
    drawTrain(ctx, state, ui, time);
    drawTunnelFront(ctx, state);
    drawBarricades(ctx, state, ui, view);
    drawSentries(ctx, state, ui, time);
    drawOrders(ctx, state, ui);
    drawUnits(ctx, state, ui, time);
    drawEnemies(ctx, state, view, time, visible);
    drawShells(ctx, state, time);
    drawEffects(ctx, state);
    drawPlacement(ctx, state, ui);

    // Screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOffscreenIndicators(ctx, state, cam, W, H, time, visible);

    minimapT -= 1 / 60;
    if (minimapT <= 0) {
      minimapT = 0.15;
      renderMinimap(mctx, minimap, state, cam, dpr, visible);
    }
  }

  return { render, resize };
}

// --- World ---------------------------------------------------------------

function makeDecorations(state) {
  const rng = createRng((state.level.seed ?? 1) + 7);
  const out = [];
  const H = state.world.height;
  const trackY = state.world.trackY;
  for (let x = -400; x < state.world.length + 900; x += 18 + rng() * 40) {
    const y = rng() * H;
    if (Math.abs(y - trackY) < 45) continue;
    const r = rng();
    out.push({ x, y, kind: r < 0.3 ? 'rock' : r < 0.85 ? 'tuft' : 'tree', s: 3 + rng() * 7 });
  }
  return out;
}

function drawGround(ctx, state, view) {
  const H = state.world.height;
  const trackY = state.world.trackY;
  // Slightly darker the further from the rails: the wilds.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.groundFar);
  g.addColorStop(Math.max(0, (trackY - 250) / H), COLORS.ground);
  g.addColorStop(Math.min(1, (trackY + 250) / H), COLORS.ground);
  g.addColorStop(1, COLORS.groundFar);
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, 0, view.x1 - view.x0, H);
}

function drawDecorations(ctx, decorations, view) {
  for (const d of decorations) {
    if (d.x < view.x0 || d.x > view.x1 || d.y < view.y0 || d.y > view.y1) continue;
    if (d.kind === 'rock') {
      ctx.fillStyle = '#4a4a42';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.s, d.s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 'tree') {
      ctx.fillStyle = '#2f3d27';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.s * 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#4b5a37';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(d.x - d.s * 0.5, d.y);
      ctx.lineTo(d.x - d.s * 0.2, d.y - d.s);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y - d.s * 1.2);
      ctx.moveTo(d.x + d.s * 0.5, d.y);
      ctx.lineTo(d.x + d.s * 0.2, d.y - d.s);
      ctx.stroke();
    }
  }
}

function drawTrack(ctx, state, view) {
  const y = state.world.trackY;
  const x0 = view.x0;
  const x1 = Math.min(view.x1, state.world.length + 300);
  ctx.fillStyle = COLORS.bed;
  ctx.fillRect(x0, y - 22, x1 - x0, 44);
  ctx.fillStyle = COLORS.tie;
  for (let x = Math.floor(x0 / 22) * 22; x < x1; x += 22) ctx.fillRect(x, y - 16, 7, 32);
  ctx.fillStyle = COLORS.rail;
  ctx.fillRect(x0, y - 11, x1 - x0, 2.5);
  ctx.fillRect(x0, y + 8.5, x1 - x0, 2.5);
}

function drawDistanceMarkers(ctx, state, view) {
  const ppm = state.config.world.pxPerMeter;
  const y = state.world.trackY;
  ctx.fillStyle = 'rgba(233,228,214,0.35)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const step = 1000;
  for (let x = Math.ceil(view.x0 / step) * step; x < Math.min(view.x1, state.world.length); x += step) {
    ctx.fillRect(x - 1, y + 26, 2, 10);
    ctx.fillText(`${Math.round((state.world.length - x) / ppm)} m`, x, y + 48);
  }
}

function drawTunnelBack(ctx, state) {
  const x = state.world.length;
  const y = state.world.trackY;
  const H = state.world.height;
  ctx.fillStyle = '#2a2823';
  ctx.beginPath();
  ctx.moveTo(x - 30, 0);
  ctx.lineTo(x + 1200, 0);
  ctx.lineTo(x + 1200, H);
  ctx.lineTo(x - 30, H);
  ctx.lineTo(x - 10, y + 160);
  ctx.lineTo(x - 50, y + 40);
  ctx.lineTo(x - 50, y - 40);
  ctx.lineTo(x - 10, y - 160);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 50, y - 30, 1250, 60);
}

function drawTunnelFront(ctx, state) {
  const x = state.world.length;
  const y = state.world.trackY;
  ctx.fillStyle = COLORS.tunnel;
  ctx.fillRect(x, y - 30, 1200, 60);
  ctx.strokeStyle = '#8c7b5b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + 32);
  ctx.lineTo(x, y - 20);
  ctx.quadraticCurveTo(x, y - 38, x + 18, y - 38);
  ctx.stroke();
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('EXIT', x + 12, y - 52);
}

function hoverIs(ui, kind, id) {
  return ui.hover && ui.hover.kind === kind && ui.hover.id === id;
}

function inView(view, x, y, pad = 60) {
  return x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
}

function label(ctx, text, x, y, color = COLORS.text, font = 'bold 11px ui-monospace, monospace') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function drawNodes(ctx, state, ui, view) {
  for (const n of state.nodes) {
    if (!inView(view, n.x, n.y)) continue;
    const empty = n.amount <= 0;
    if (empty && n.max < 1) continue;
    const color = n.kind === 'fuel' ? COLORS.fuel : COLORS.scrap;
    ctx.globalAlpha = empty ? 0.25 : 1;
    const frac = Math.max(0.25, Math.sqrt(n.amount / n.max)) * 0.8;
    if (n.kind === 'fuel') {
      ctx.fillStyle = '#5a3d12';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * frac, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3d4247';
      polygon(ctx, n.x, n.y, n.radius, 6, 0.3);
      ctx.fill();
      ctx.fillStyle = color;
      polygon(ctx, n.x, n.y, n.radius * frac, 6, 0.3);
      ctx.fill();
    }
    if (hoverIs(ui, 'node', n.id) && !empty) ring(ctx, n.x, n.y, n.radius + 5, COLORS.select, 2);
    ctx.globalAlpha = 1;
    label(ctx, empty ? `${n.kind.toUpperCase()} (empty)` : `${n.kind.toUpperCase()} ${Math.ceil(n.amount)}`, n.x, n.y - n.radius - 7);
  }
}

function drawWrecks(ctx, state, ui, view) {
  const t = state.config.train;
  for (const w of state.wrecks) {
    if (w.done || !inView(view, w.x, w.y)) continue;
    const def = state.config.cars[w.carType];
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(0.12);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = def.color;
    roundRect(ctx, -t.carLength / 2, -t.carHeight / 2, t.carLength, t.carHeight, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = hoverIs(ui, 'wreck', w.id) ? COLORS.select : '#ddd';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    label(ctx, `WRECK: ${def.label.toUpperCase()}`, w.x, w.y - t.carHeight / 2 - 12);
    label(ctx, `${Math.round(w.hp)}/${def.hp} HP · salvage to attach`, w.x, w.y + t.carHeight / 2 + 16, COLORS.hpMid, '10px ui-monospace, monospace');
    if (w.work > 0) progressBar(ctx, w.x - 30, w.y + t.carHeight / 2 + 22, 60, w.work / w.workNeeded, COLORS.crewRing);
  }
}

function drawSurvivors(ctx, state, ui, view, time) {
  for (const sv of state.survivors) {
    if (sv.rescued || !inView(view, sv.x, sv.y)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ring(ctx, sv.x, sv.y, 14 + pulse * 4, `rgba(63,182,168,${0.3 + 0.5 * pulse})`, 2);
    ctx.fillStyle = COLORS.crew;
    ctx.beginPath();
    ctx.arc(sv.x, sv.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, sv.x, sv.y, 8, hoverIs(ui, 'survivor', sv.id) ? COLORS.select : COLORS.crewRing, 2);
    label(ctx, `SURVIVOR — rescue?`, sv.x, sv.y - 24);
  }
}

function drawNests(ctx, state, ui, view, time) {
  const def = state.config.nest;
  for (const n of state.nests) {
    if (!inView(view, n.x, n.y, 120)) continue;
    const pulse = n.awake ? 0.5 + 0.5 * Math.sin(time * 6) : 0.2;
    ctx.fillStyle = n.hitFlash > 0 ? '#fff' : def.color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = n.radius * (i % 2 ? 0.75 : 1.1);
      ctx.lineTo(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a0d14';
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (n.awake) {
      ring(ctx, n.x, n.y, n.radius + 8 + pulse * 6, `rgba(255,80,140,${0.25 + 0.4 * pulse})`, 2);
      ctx.setLineDash([6, 8]);
      ring(ctx, n.x, n.y, def.activationRadius, 'rgba(255,80,140,0.18)', 1);
      ctx.setLineDash([]);
    }
    if (hoverIs(ui, 'nest', n.id)) ring(ctx, n.x, n.y, n.radius + 5, COLORS.select, 2);
    label(ctx, n.awake ? 'NEST (awake)' : 'NEST', n.x, n.y - n.radius - 16, n.awake ? '#ff7aa8' : COLORS.text);
    hpBar(ctx, n.x - 22, n.y - n.radius - 10, 44, n.hp / n.maxHp);
  }
}

function drawMines(ctx, state, view, time) {
  for (const m of state.mines) {
    if (!inView(view, m.x, m.y)) continue;
    ctx.fillStyle = '#4b5130';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (m.arm <= 0 && Math.sin(time * 6 + m.id) > 0) {
      ctx.fillStyle = '#e45a4a';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawShieldBubbles(ctx, state) {
  state.train.cars.forEach((car, i) => {
    const def = state.config.cars[car.type].shield;
    if (!def || car.hp <= 0) return;
    const r = carRect(state, i);
    const f = car.shield / def.capacity;
    ctx.fillStyle = `rgba(127,209,217,${0.04 + 0.08 * f})`;
    ctx.beginPath();
    ctx.arc(r.cx, r.cy, def.radius, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, r.cx, r.cy, def.radius, `rgba(127,209,217,${0.15 + 0.5 * f})`, 1.5);
  });
}

function drawBarricades(ctx, state, ui, view) {
  for (const b of state.barricades) {
    if (b.broken || !inView(view, b.x, b.y)) continue;
    const h = 64;
    const w = b.reinforced ? 26 : 18;
    const x0 = b.x;
    const y0 = b.y - h / 2;
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(x0, y0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = b.reinforced ? '#b8b8c4' : '#e8b33a';
    for (let k = -2; k < 8; k++) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + k * 12);
      ctx.lineTo(x0 + w, y0 + k * 12 + 10);
      ctx.lineTo(x0 + w, y0 + k * 12 + 16);
      ctx.lineTo(x0, y0 + k * 12 + 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = hoverIs(ui, 'barricade', b.id) ? COLORS.select : '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, w, h);

    const out = ramOutcome(state, b);
    const front = state.config.cars[state.train.cars[0].type].label;
    label(ctx, `${b.reinforced ? 'REINFORCED ' : ''}BARRICADE (${b.strength})`, b.x + w / 2, y0 - 22);
    const msg = out.breaks ? `ram: -${out.damage} HP to ${front}` : 'needs a RAM CAR at the front — or dig';
    label(ctx, msg, b.x + w / 2, y0 - 9, !out.breaks || out.damage >= 40 ? COLORS.hpBad : COLORS.hpGood, '10px ui-monospace, monospace');
    if (b.work > 0) progressBar(ctx, b.x - 21, b.y + h / 2 + 6, 60, b.work / b.workNeeded, COLORS.crewRing);
  }
}

function drawCarGlyph(ctx, state, car, i, r, time) {
  const def = state.config.cars[car.type];
  const disabled = car.hp <= 0;
  ctx.save();
  switch (car.type) {
    case 'locomotive': {
      ctx.fillStyle = '#0005';
      ctx.fillRect(r.x0 + 6, r.y0 + 6, 20, r.y1 - r.y0 - 12);
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(r.x1 - 16, r.cy, 6, 0, Math.PI * 2);
      ctx.fill();
      if (state.train.speed > 1 && state.fuel > 0) {
        const puff = (time * 3) % 1;
        ctx.fillStyle = `rgba(200,200,200,${0.5 * (1 - puff)})`;
        ctx.beginPath();
        ctx.arc(r.x1 - 16 - puff * 30, r.cy - 6 - puff * 14, 5 + puff * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'turret':
    case 'cannon': {
      const big = car.type === 'cannon';
      ctx.fillStyle = '#1e3a5c';
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, big ? 13 : 11, 0, Math.PI * 2);
      ctx.fill();
      const a = car.aim ?? -Math.PI / 2;
      ctx.strokeStyle = '#1e3a5c';
      ctx.lineWidth = big ? 7 : 5;
      ctx.beginPath();
      ctx.moveTo(r.cx, r.cy);
      ctx.lineTo(r.cx + Math.cos(a) * (big ? 28 : 22), r.cy + Math.sin(a) * (big ? 28 : 22));
      ctx.stroke();
      break;
    }
    case 'flamer': {
      ctx.fillStyle = '#5a1f12';
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, 10, 0, Math.PI * 2);
      ctx.fill();
      const a = car.aim ?? -Math.PI / 2;
      ctx.strokeStyle = '#5a1f12';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(r.cx, r.cy);
      ctx.lineTo(r.cx + Math.cos(a) * 16, r.cy + Math.sin(a) * 16);
      ctx.stroke();
      break;
    }
    case 'armor': {
      ctx.strokeStyle = '#0006';
      ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        ctx.strokeRect(r.x0 + 4 + k * 14.5, r.y0 + 4, 12, r.y1 - r.y0 - 8);
      }
      break;
    }
    case 'shield': {
      const f = def.shield ? car.shield / def.shield.capacity : 0;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * f})`;
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mineLayer': {
      ctx.fillStyle = '#0005';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(r.x0 + 14 + k * 18, r.cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'crane': {
      const target = car.craneTarget ? state.nodes.find((n) => n.id === car.craneTarget) : null;
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(r.cx, r.cy);
      if (target) {
        const a = Math.atan2(target.y - r.cy, target.x - r.cx);
        const len = Math.min(Math.hypot(target.x - r.cx, target.y - r.cy), def.crane.reach);
        ctx.lineTo(r.cx + Math.cos(a) * len, r.cy + Math.sin(a) * len);
      } else {
        ctx.lineTo(r.x0 + 6, r.y0 + 4);
      }
      ctx.stroke();
      break;
    }
    case 'workshop': {
      ctx.strokeStyle = '#0007';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(r.cx - 9, r.cy - 9);
      ctx.lineTo(r.cx + 9, r.cy + 9);
      ctx.moveTo(r.cx + 9, r.cy - 9);
      ctx.lineTo(r.cx - 9, r.cy + 9);
      ctx.stroke();
      if (car.working) {
        ctx.fillStyle = `rgba(255,230,120,${0.5 + 0.5 * Math.sin(time * 12)})`;
        ctx.beginPath();
        ctx.arc(r.cx, r.cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'armory': {
      for (let k = 0; k < (def.kits ?? 0); k++) {
        ctx.fillStyle = k < (car.kits ?? 0) ? COLORS.kit : '#0004';
        ctx.fillRect(r.x0 + 12 + k * 22, r.y0 + 9, 16, 16);
      }
      break;
    }
    case 'tankBay':
    case 'excavatorBay': {
      const v = state.vehicles.find((x) => x.id === car.vehicleId);
      if (v && !v.deployed) {
        ctx.fillStyle = state.config.vehicles[v.type].color;
        roundRect(ctx, r.x0 + 12, r.y0 + 7, 40, 20, 4);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#0006';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(r.x0 + 12, r.y0 + 7, 40, 20);
      }
      break;
    }
    case 'fuelTank': {
      ctx.strokeStyle = '#0005';
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        const x = r.x0 + ((r.x1 - r.x0) * k) / 4;
        ctx.beginPath();
        ctx.moveTo(x, r.y0 + 3);
        ctx.lineTo(x, r.y1 - 3);
        ctx.stroke();
      }
      break;
    }
    case 'ram': {
      ctx.fillStyle = '#0005';
      for (let k = 0; k < 3; k++) {
        const x = r.x0 + 12 + k * 14;
        ctx.beginPath();
        ctx.moveTo(x, r.y0 + 6);
        ctx.lineTo(x + 9, r.cy);
        ctx.lineTo(x, r.y1 - 6);
        ctx.closePath();
        ctx.fill();
      }
      if (i === 0 && !disabled) {
        ctx.fillStyle = '#d8d8e0';
        ctx.beginPath();
        ctx.moveTo(r.x1, r.y0 - 4);
        ctx.lineTo(r.x1 + 12, r.cy);
        ctx.lineTo(r.x1, r.y1 + 4);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function drawTrain(ctx, state, ui, time) {
  const cars = state.train.cars;
  const cfg = state.config;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(trainTail(state), state.world.trackY);
  ctx.lineTo(state.train.head, state.world.trackY);
  ctx.stroke();

  cars.forEach((car, i) => {
    const r = carRect(state, i);
    const def = cfg.cars[car.type];
    const disabled = car.hp <= 0;
    const selected = ui.selectedCarId === car.id;
    const hovered = hoverIs(ui, 'car', car.id);

    // Range rings for the selected/hovered car.
    if ((selected || hovered) && !disabled) {
      const rr = def.weapon?.range ?? def.crane?.reach ?? null;
      if (rr) {
        ctx.setLineDash([6, 6]);
        ring(ctx, r.cx, r.cy, rr, 'rgba(255,255,255,0.35)', 1.5);
        if (def.weapon?.minRange) ring(ctx, r.cx, r.cy, def.weapon.minRange, 'rgba(255,120,120,0.35)', 1);
        ctx.setLineDash([]);
      }
    }

    ctx.fillStyle = car.hitFlash > 0 ? '#ffffff' : disabled ? COLORS.disabled : def.color;
    roundRect(ctx, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 5);
    ctx.fill();
    ctx.strokeStyle = selected ? COLORS.select : hovered ? '#fff8' : '#0006';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();

    drawCarGlyph(ctx, state, car, i, r, time);
    if (disabled) {
      ctx.strokeStyle = COLORS.hpBad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.x0 + 10, r.y0 + 6);
      ctx.lineTo(r.x1 - 10, r.y1 - 6);
      ctx.moveTo(r.x1 - 10, r.y0 + 6);
      ctx.lineTo(r.x0 + 10, r.y1 - 6);
      ctx.stroke();
    }
    hpBar(ctx, r.x0 + 4, r.y0 - 8, r.x1 - r.x0 - 8, car.hp / car.maxHp);
    label(ctx, def.short, r.cx, r.y1 + 12, 'rgba(233,228,214,0.6)', '9px ui-monospace, monospace');
  });
}

function drawSentries(ctx, state, ui, time) {
  const def = state.config.sentry;
  for (const s of state.sentries) {
    if (s.hp <= 0) continue;
    if (hoverIs(ui, 'sentry', s.id)) {
      ctx.setLineDash([5, 5]);
      ring(ctx, s.x, s.y, def.weapon.range, 'rgba(180,155,224,0.4)', 1);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#3d2f57';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(a) * 14, s.y + Math.sin(a) * 14);
      ctx.stroke();
    }
    ctx.fillStyle = s.hitFlash > 0 ? '#fff' : def.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
    ctx.fill();
    const a = s.aim ?? 0;
    ctx.strokeStyle = '#3d2f57';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(a) * 16, s.y + Math.sin(a) * 16);
    ctx.stroke();
    hpBar(ctx, s.x - 12, s.y - 20, 24, s.hp / s.maxHp);
    if (s.pack > 0) progressBar(ctx, s.x - 15, s.y + 16, 30, s.pack / def.packTime, COLORS.crewRing);
  }
}

function drawOrders(ctx, state, ui) {
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1.5;
  for (const u of activeUnits(state)) {
    if (!u.order || !ui.selected.has(u.id)) continue;
    let tx;
    let ty;
    if (u.order.type === 'move' || u.order.type === 'deploy') {
      tx = u.order.x;
      ty = u.order.y;
    } else if (u.order.type === 'work') {
      const site = getSite(state, u.order);
      if (!site) continue;
      tx = site.x;
      ty = site.y;
    } else {
      tx = Math.max(trainTail(state), Math.min(state.train.head, u.x));
      ty = state.world.trackY;
    }
    ctx.strokeStyle = 'rgba(255,224,102,0.6)';
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    if (u.order.type === 'deploy') {
      ctx.setLineDash([]);
      ring(ctx, tx, ty - 16, 10, COLORS.kit, 2);
      ctx.setLineDash([4, 5]);
    }
  }
  ctx.setLineDash([]);
}

function drawCarry(ctx, u, x, y) {
  if (u.carry && u.carry.amount > 0) {
    ctx.fillStyle = u.carry.kind === 'fuel' ? COLORS.fuel : COLORS.scrap;
    ctx.fillRect(x, y, 8, 8);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, 8, 8);
  }
  if (u.kit) {
    ctx.fillStyle = COLORS.kit;
    ctx.fillRect(x + (u.carry ? 10 : 0), y, 8, 8);
  }
}

function drawUnits(ctx, state, ui, time) {
  // Crew aboard: dots on the cars.
  for (const c of state.crew) {
    if (!c.alive || !c.aboard) continue;
    ctx.fillStyle = ui.selected.has(c.id) ? COLORS.select : COLORS.crew;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const u of activeUnits(state)) {
    const stats = unitStats(state, u);
    const selected = ui.selected.has(u.id);
    if (selected && stats.weapon) {
      ring(ctx, u.x, u.y, stats.weapon.range, 'rgba(241,234,216,0.2)', 1);
    }
    if (u.kind === 'vehicle') {
      const def = state.config.vehicles[u.type];
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.fillStyle = u.hitFlash > 0 ? '#fff' : def.color;
      roundRect(ctx, -17, -12, 34, 24, 5);
      ctx.fill();
      ctx.strokeStyle = selected ? COLORS.select : '#000a';
      ctx.lineWidth = selected ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = '#0006';
      ctx.fillRect(-17, -14, 34, 4);
      ctx.fillRect(-17, 10, 34, 4);
      if (u.type === 'tank') {
        ctx.fillStyle = '#3c4f1c';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3c4f1c';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(u.aim ?? 0) * 22, Math.sin(u.aim ?? 0) * 22);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#4a3a10';
        ctx.lineWidth = 4;
        const swing = u.working ? Math.sin(time * 8) * 0.5 : 0;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(-0.6 + swing) * 22, Math.sin(-0.6 + swing) * 22);
        ctx.stroke();
      }
      ctx.restore();
      label(ctx, def.label, u.x, u.y + 28, COLORS.text, '10px ui-monospace, monospace');
      hpBar(ctx, u.x - 16, u.y - 22, 32, u.hp / u.maxHp);
      if (u.carry) progressBar(ctx, u.x - 16, u.y + 16, 32, u.carry.amount / def.carry, u.carry.kind === 'fuel' ? COLORS.fuel : COLORS.scrap);
      continue;
    }
    const r = state.config.crew.radius;
    ctx.fillStyle = u.hitFlash > 0 ? '#fff' : COLORS.crew;
    ctx.beginPath();
    ctx.arc(u.x, u.y, r, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, u.x, u.y, r, selected ? COLORS.select : COLORS.crewRing, selected ? 3 : 2);
    if (u.working) {
      ctx.strokeStyle = COLORS.fuel;
      ctx.lineWidth = 2;
      const a = time * 6;
      ctx.beginPath();
      ctx.arc(u.x, u.y, r + 5, a, a + 1.5);
      ctx.stroke();
    }
    drawCarry(ctx, u, u.x + r - 2, u.y - r - 4);
    label(ctx, u.name, u.x, u.y + r + 13, COLORS.text, '10px ui-monospace, monospace');
    hpBar(ctx, u.x - 12, u.y - r - 8, 24, u.hp / u.maxHp);
  }
}

function drawEnemyShape(ctx, e, def, time) {
  ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : def.color;
  const r = def.radius;
  switch (e.type) {
    case 'shooter':
      ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
      ctx.strokeStyle = '#000a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(e.x - r, e.y - r, r * 2, r * 2);
      break;
    case 'rusher': {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      ring(ctx, e.x, e.y, r + 6 + pulse * 4, `rgba(255,61,240,${0.3 + 0.5 * pulse})`, 2);
      polygon(ctx, e.x, e.y, r + 2, 3, -Math.PI / 2);
      ctx.fill();
      label(ctx, '!', e.x, e.y - r - 12, def.color, 'bold 13px ui-monospace, monospace');
      break;
    }
    case 'swarmer':
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + (e.lunge > 0 ? 1.5 : 0), 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'brute':
      polygon(ctx, e.x, e.y, r, 6, 0);
      ctx.fill();
      ctx.strokeStyle = '#2a0d07';
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    case 'sniper':
      polygon(ctx, e.x, e.y, r + 2, 4, 0);
      ctx.fill();
      break;
    case 'mortar':
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2405';
      ctx.fillRect(e.x - 3, e.y - r - 6, 6, 10);
      break;
    default:
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
  }
}

function drawEnemies(ctx, state, view, time, visible) {
  const defs = state.config.enemies;
  for (const e of state.enemies) {
    if (!inView(view, e.x, e.y) || !visible(e.x, e.y)) continue;
    const def = defs[e.type];
    // Sniper laser: brighter as the shot gets closer.
    if (e.type === 'sniper' && e.aim > 0 && e.aimX != null) {
      const f = Math.min(1, e.aim / def.aimTime);
      ctx.strokeStyle = `rgba(79,209,255,${0.25 + 0.65 * f})`;
      ctx.lineWidth = 1 + f;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.aimX, e.aimY);
      ctx.stroke();
    }
    drawEnemyShape(ctx, e, def, time);
    if (e.hp < e.maxHp) hpBar(ctx, e.x - 10, e.y - def.radius - 7, 20, e.hp / e.maxHp);
  }
}

function drawShells(ctx, state, time) {
  for (const s of state.shells) {
    const f = 1 - s.t / s.flight;
    // Landing marker.
    ctx.setLineDash([5, 4]);
    ring(ctx, s.x, s.y, s.radius, `rgba(255,159,26,${0.35 + 0.5 * f})`, 2);
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,159,26,${0.08 + 0.15 * f})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * f, 0, Math.PI * 2);
    ctx.fill();
    // The shell itself, on an arc.
    const x = s.fromX + (s.x - s.fromX) * f;
    const y = s.fromY + (s.y - s.fromY) * f - Math.sin(f * Math.PI) * 120;
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects(ctx, state) {
  for (const fx of state.effects) {
    const a = Math.max(0, fx.ttl / fx.maxTtl);
    ctx.globalAlpha = a;
    if (fx.kind === 'tracer') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = fx.width ?? 2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
    } else if (fx.kind === 'burst') {
      ring(ctx, fx.x, fx.y, fx.r * (1.2 - a * 0.6), fx.color, 3);
    } else if (fx.kind === 'flame') {
      const g = ctx.createRadialGradient(fx.x, fx.y, 4, fx.x, fx.y, fx.range);
      g.addColorStop(0, 'rgba(255,200,80,0.55)');
      g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx.x, fx.y);
      ctx.arc(fx.x, fx.y, fx.range, fx.angle - 0.5, fx.angle + 0.5);
      ctx.closePath();
      ctx.fill();
    } else if (fx.kind === 'shieldHit') {
      ring(ctx, fx.x, fx.y, 14 + (1 - a) * 10, '#bdf3f8', 2);
    } else if (fx.kind === 'haul') {
      const t = 1 - a;
      ctx.fillStyle = fx.color;
      ctx.fillRect(fx.x1 + (fx.x2 - fx.x1) * t - 4, fx.y1 + (fx.y2 - fx.y1) * t - 4, 8, 8);
    }
  }
  ctx.globalAlpha = 1;
}

function drawFog(ctx, state, view, sources) {
  const fog = state.fog;
  if (!fog.enabled) return;
  const c = fog.cell;
  const cx0 = Math.max(0, Math.floor(view.x0 / c));
  const cx1 = Math.min(fog.cols - 1, Math.floor(view.x1 / c));
  const cy0 = Math.max(0, Math.floor(view.y0 / c));
  const cy1 = Math.min(fog.rows - 1, Math.floor(view.y1 / c));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const x = cx * c;
      const y = cy * c;
      if (!fog.explored[cy * fog.cols + cx]) {
        ctx.fillStyle = COLORS.fog;
        ctx.fillRect(x - 0.5, y - 0.5, c + 1, c + 1);
      } else if (!isVisible(state, x + c / 2, y + c / 2, sources)) {
        ctx.fillStyle = 'rgba(8,8,6,0.42)';
        ctx.fillRect(x, y, c, c);
      }
    }
  }
}

function drawPlacement(ctx, state, ui) {
  if (ui.placing !== 'sentry' || !ui.mouseWorld) return;
  const { x, y } = ui.mouseWorld;
  const def = state.config.sentry;
  ctx.setLineDash([6, 6]);
  ring(ctx, x, y - 16, def.weapon.range, 'rgba(180,155,224,0.6)', 1.5);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(x, y - 16, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  label(ctx, 'Click to place sentry · right-click / Esc to cancel', x, y + 10, COLORS.kit);
}

// --- Screen space -------------------------------------------------------

function drawOffscreenIndicators(ctx, state, cam, W, H, time, visible) {
  for (const e of state.enemies) {
    if (!visible(e.x, e.y)) continue;
    let sx = (e.x - cam.x) * cam.scale;
    let sy = (e.y - cam.y) * cam.scale;
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue;
    const loud = e.type === 'rusher' || e.type === 'brute';
    const size = loud ? 11 : 7;
    const cxs = W / 2;
    const cys = H / 2;
    const a = Math.atan2(sy - cys, sx - cxs);
    sx = Math.max(10, Math.min(W - 10, sx));
    sy = Math.max(10, Math.min(H - 10, sy));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.fillStyle = loud && Math.sin(time * 14) > 0 ? '#ffffff' : state.config.enemies[e.type].color;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-size, -size * 0.8);
    ctx.lineTo(-size, size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function minimapTransform(state, canvasW, canvasH) {
  const pad = 30;
  const start = state.level.startX - 300;
  const end = state.world.length + 200;
  return {
    sx: (x) => pad + ((x - start) / (end - start)) * (canvasW - pad * 2),
    sy: (y) => 2 + (y / state.world.height) * (canvasH - 4),
    wx: (px) => start + ((px - pad) / (canvasW - pad * 2)) * (end - start),
    wy: (py) => ((py - 2) / (canvasH - 4)) * state.world.height,
  };
}

function renderMinimap(ctx, canvas, state, cam, dpr, visible) {
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const { sx, sy } = minimapTransform(state, W, H);

  // Explored ground.
  const fog = state.fog;
  ctx.fillStyle = '#3a3a30';
  if (fog.enabled) {
    const cw = sx(fog.cell) - sx(0) + 0.6;
    const ch = sy(fog.cell) - sy(0) + 0.6;
    for (let cy = 0; cy < fog.rows; cy++) {
      for (let cx = 0; cx < fog.cols; cx++) {
        if (fog.explored[cy * fog.cols + cx]) ctx.fillRect(sx(cx * fog.cell), sy(cy * fog.cell), cw, ch);
      }
    }
  } else {
    ctx.fillRect(sx(0), sy(0), sx(state.world.length) - sx(0), H - 4);
  }

  ctx.fillStyle = '#6b665a';
  ctx.fillRect(sx(state.level.startX - 300), sy(state.world.trackY) - 1, sx(state.world.length) - sx(state.level.startX - 300), 2);

  const known = (x, y) => isExplored(state, x, y);
  for (const n of state.nodes) {
    if (n.amount <= 0 || !known(n.x, n.y)) continue;
    ctx.fillStyle = n.kind === 'fuel' ? COLORS.fuel : COLORS.scrap;
    ctx.fillRect(sx(n.x) - 1.5, sy(n.y) - 1.5, 3, 3);
  }
  for (const n of state.nests) {
    if (!known(n.x, n.y)) continue;
    ctx.fillStyle = n.awake ? '#ff5a8c' : '#7d2f4f';
    ctx.beginPath();
    ctx.arc(sx(n.x), sy(n.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const w of state.wrecks) {
    if (w.done || !known(w.x, w.y)) continue;
    ctx.strokeStyle = state.config.cars[w.carType].color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx(w.x) - 3, sy(w.y) - 2, 6, 4);
  }
  for (const s of state.survivors) {
    if (s.rescued || !known(s.x, s.y)) continue;
    ctx.fillStyle = COLORS.crewRing;
    ctx.beginPath();
    ctx.arc(sx(s.x), sy(s.y), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Barricades are always known: you can see down the line.
  for (const b of state.barricades) {
    if (b.broken) continue;
    ctx.fillStyle = b.reinforced ? '#d0d0dc' : '#e8b33a';
    ctx.fillRect(sx(b.x) - 1.5, sy(state.world.trackY) - 6, 3, 12);
  }
  for (const e of state.enemies) {
    if (!visible(e.x, e.y)) continue;
    ctx.fillStyle = '#e45a4a';
    ctx.fillRect(sx(e.x) - 1, sy(e.y) - 1, 2, 2);
  }
  for (const u of activeUnits(state)) {
    ctx.fillStyle = COLORS.crew;
    ctx.fillRect(sx(u.x) - 1.5, sy(u.y) - 1.5, 3, 3);
  }

  ctx.fillStyle = COLORS.text;
  ctx.fillRect(sx(state.world.length) - 1, 1, 2, H - 2);

  ctx.fillStyle = state.config.cars.locomotive.color;
  const tx0 = sx(trainTail(state));
  ctx.fillRect(tx0, sy(state.world.trackY) - 3, Math.max(4, sx(state.train.head) - tx0), 6);

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx(cam.x), sy(Math.max(0, cam.y)), sx(cam.x + cam.viewW) - sx(cam.x), sy(Math.min(state.world.height, cam.y + cam.viewH)) - sy(Math.max(0, cam.y)));
}

// --- Helpers ------------------------------------------------------------

function ring(ctx, x, y, r, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function hpBar(ctx, x, y, w, frac) {
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = '#000a';
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = frac > 0.6 ? COLORS.hpGood : frac > 0.3 ? COLORS.hpMid : COLORS.hpBad;
  ctx.fillRect(x, y, w * frac, 4);
}

function progressBar(ctx, x, y, w, frac, color) {
  ctx.fillStyle = '#000a';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 5);
}

function polygon(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
