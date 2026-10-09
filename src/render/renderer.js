// Canvas renderer. Gray-box placeholder shapes only; reads sim state, never mutates it.

import { createRng } from '../sim/rng.js';
import { carRect, trainTail } from '../sim/train.js';

const COLORS = {
  ground: '#33342c',
  groundEdge: '#262720',
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
};

export function createRenderer(canvas, minimap, level, config) {
  const ctx = canvas.getContext('2d');
  const mctx = minimap.getContext('2d');
  const decorations = makeDecorations(level, config);
  let dpr = 1;

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
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // World space.
    ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, -cam.x * dpr * cam.scale, 0);
    const view = { x0: cam.x - 50, x1: cam.x + cam.viewW + 50 };
    drawGround(ctx, state, view);
    drawDecorations(ctx, decorations, view);
    drawTrack(ctx, state, view);
    drawDistanceMarkers(ctx, state, view);
    drawNodes(ctx, state, ui, view);
    drawTunnelBack(ctx, state);
    drawTrain(ctx, state, ui, time);
    drawTunnelFront(ctx, state);
    drawOrders(ctx, state, ui);
    drawCrew(ctx, state, ui, time);
    drawEnemies(ctx, state, time);
    drawEffects(ctx, state);

    // Screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOffscreenIndicators(ctx, state, cam, W, time);

    renderMinimap(mctx, minimap, state, cam, dpr);
  }

  return { render, resize };
}

// --- World ---------------------------------------------------------------

function makeDecorations(level, config) {
  const rng = createRng(level.seed + 7);
  const out = [];
  const H = config.world.height;
  const trackY = config.world.trackY;
  for (let x = -400; x < level.exitX + 800; x += 30 + rng() * 70) {
    const y = rng() * H;
    if (Math.abs(y - trackY) < 45) continue;
    out.push({ x, y, kind: rng() < 0.35 ? 'rock' : 'tuft', s: 3 + rng() * 7 });
  }
  return out;
}

function drawGround(ctx, state, view) {
  const H = state.config.world.height;
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(view.x0, 0, view.x1 - view.x0, H);
  // Darker wild margins at top and bottom: where enemies come from.
  const g1 = ctx.createLinearGradient(0, 0, 0, 90);
  g1.addColorStop(0, COLORS.groundEdge);
  g1.addColorStop(1, 'rgba(38,39,32,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(view.x0, 0, view.x1 - view.x0, 90);
  const g2 = ctx.createLinearGradient(0, H - 90, 0, H);
  g2.addColorStop(0, 'rgba(38,39,32,0)');
  g2.addColorStop(1, COLORS.groundEdge);
  ctx.fillStyle = g2;
  ctx.fillRect(view.x0, H - 90, view.x1 - view.x0, 90);
}

function drawDecorations(ctx, decorations, view) {
  for (const d of decorations) {
    if (d.x < view.x0 || d.x > view.x1) continue;
    if (d.kind === 'rock') {
      ctx.fillStyle = '#4a4a42';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.s, d.s * 0.7, 0, 0, Math.PI * 2);
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
  const y = state.config.world.trackY;
  const x0 = view.x0;
  const x1 = Math.min(view.x1, state.level.exitX + 300);
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
  const y = state.config.world.trackY;
  ctx.fillStyle = 'rgba(233,228,214,0.35)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const step = 1000;
  for (let x = Math.ceil(view.x0 / step) * step; x < Math.min(view.x1, state.level.exitX); x += step) {
    const remaining = Math.round((state.level.exitX - x) / ppm);
    ctx.fillRect(x - 1, y + 26, 2, 10);
    ctx.fillText(`${remaining} m`, x, y + 48);
  }
}

function drawTunnelBack(ctx, state) {
  const x = state.level.exitX;
  const y = state.config.world.trackY;
  const H = state.config.world.height;
  ctx.fillStyle = '#2a2823';
  ctx.beginPath();
  ctx.moveTo(x - 30, 0);
  ctx.lineTo(x + 900, 0);
  ctx.lineTo(x + 900, H);
  ctx.lineTo(x - 30, H);
  ctx.lineTo(x - 10, y + 120);
  ctx.lineTo(x - 50, y + 40);
  ctx.lineTo(x - 50, y - 40);
  ctx.lineTo(x - 10, y - 120);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 50, y - 30, 950, 60);
}

function drawTunnelFront(ctx, state) {
  const x = state.level.exitX;
  const y = state.config.world.trackY;
  // The portal face covers cars that have entered the tunnel.
  ctx.fillStyle = COLORS.tunnel;
  ctx.fillRect(x, y - 30, 900, 60);
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

function drawNodes(ctx, state, ui, view) {
  for (const n of state.nodes) {
    if (n.x + n.radius < view.x0 || n.x - n.radius > view.x1) continue;
    const empty = n.amount <= 0;
    const color = n.kind === 'fuel' ? COLORS.fuel : COLORS.scrap;
    const hovered = ui.hover && ui.hover.kind === 'node' && ui.hover.id === n.id;
    ctx.globalAlpha = empty ? 0.25 : 1;
    if (n.kind === 'fuel') {
      ctx.fillStyle = '#5a3d12';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * Math.max(0.25, Math.sqrt(n.amount / n.max)) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3d4247';
      polygon(ctx, n.x, n.y, n.radius, 6, 0.3);
      ctx.fill();
      ctx.fillStyle = color;
      polygon(ctx, n.x, n.y, n.radius * Math.max(0.25, Math.sqrt(n.amount / n.max)) * 0.8, 6, 0.3);
      ctx.fill();
    }
    if (hovered && !empty) {
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const label = n.kind === 'fuel' ? 'FUEL' : 'SCRAP';
    ctx.fillText(empty ? `${label} (empty)` : `${label} ${Math.ceil(n.amount)}`, n.x, n.y - n.radius - 7);
  }
}

function drawTrain(ctx, state, ui, time) {
  const cars = state.train.cars;
  const cfg = state.config;
  // Couplings.
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(trainTail(state), cfg.world.trackY);
  ctx.lineTo(state.train.head, cfg.world.trackY);
  ctx.stroke();

  cars.forEach((car, i) => {
    const r = carRect(state, i);
    const def = cfg.cars[car.type];
    const disabled = car.hp <= 0;
    const selected = ui.selectedCarId === car.id;
    const hovered = ui.hover && ui.hover.kind === 'car' && ui.hover.id === car.id;

    if (car.type === 'turret' && (selected || hovered) && !disabled) {
      ctx.strokeStyle = 'rgba(95,157,224,0.5)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, def.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = car.hitFlash > 0 ? '#ffffff' : disabled ? COLORS.disabled : def.color;
    roundRect(ctx, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 5);
    ctx.fill();
    ctx.strokeStyle = selected ? COLORS.select : hovered ? '#fff8' : '#0006';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();

    // Role glyphs.
    ctx.save();
    if (car.type === 'locomotive') {
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
    } else if (car.type === 'turret') {
      ctx.fillStyle = '#1e3a5c';
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, 11, 0, Math.PI * 2);
      ctx.fill();
      const a = car.aim ?? -Math.PI / 2;
      ctx.strokeStyle = '#1e3a5c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(r.cx, r.cy);
      ctx.lineTo(r.cx + Math.cos(a) * 22, r.cy + Math.sin(a) * 22);
      ctx.stroke();
    } else if (car.type === 'fuelTank') {
      ctx.strokeStyle = '#0005';
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        const x = r.x0 + ((r.x1 - r.x0) * k) / 4;
        ctx.beginPath();
        ctx.moveTo(x, r.y0 + 3);
        ctx.lineTo(x, r.y1 - 3);
        ctx.stroke();
      }
    }
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
    ctx.restore();

    hpBar(ctx, r.x0 + 4, r.y0 - 8, r.x1 - r.x0 - 8, car.hp / car.maxHp);
  });
}

function drawOrders(ctx, state, ui) {
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1.5;
  for (const c of state.crew) {
    if (!c.alive || c.aboard || !c.order || !ui.selectedCrew.has(c.id)) continue;
    let tx;
    let ty;
    if (c.order.type === 'move') {
      tx = c.order.x;
      ty = c.order.y;
    } else if (c.order.type === 'gather') {
      const n = state.nodes.find((n) => n.id === c.order.nodeId);
      if (!n) continue;
      tx = n.x;
      ty = n.y;
    } else {
      tx = Math.max(trainTail(state), Math.min(state.train.head, c.x));
      ty = state.config.world.trackY;
    }
    ctx.strokeStyle = 'rgba(255,224,102,0.6)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCrew(ctx, state, ui, time) {
  const cfg = state.config.crew;
  for (const c of state.crew) {
    if (!c.alive) continue;
    const selected = ui.selectedCrew.has(c.id);
    if (c.aboard) {
      ctx.fillStyle = selected ? COLORS.select : COLORS.crew;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (selected) {
      ctx.strokeStyle = 'rgba(241,234,216,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cfg.range, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.crew;
    ctx.beginPath();
    ctx.arc(c.x, c.y, cfg.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = selected ? COLORS.select : COLORS.crewRing;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
    if (c.working) {
      ctx.strokeStyle = COLORS.fuel;
      ctx.lineWidth = 2;
      const a = time * 6;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cfg.radius + 5, a, a + 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, c.x, c.y + cfg.radius + 13);
    hpBar(ctx, c.x - 12, c.y - cfg.radius - 8, 24, c.hp / c.maxHp);
  }
}

function drawEnemies(ctx, state, time) {
  const defs = state.config.enemies;
  for (const e of state.enemies) {
    const def = defs[e.type];
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : def.color;
    if (e.type === 'shooter') {
      ctx.fillRect(e.x - def.radius, e.y - def.radius, def.radius * 2, def.radius * 2);
      ctx.strokeStyle = '#000a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(e.x - def.radius, e.y - def.radius, def.radius * 2, def.radius * 2);
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      ctx.strokeStyle = `rgba(255,61,240,${0.3 + 0.5 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, def.radius + 6 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      polygon(ctx, e.x, e.y, def.radius + 2, 3, -Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = def.color;
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', e.x, e.y - def.radius - 12);
    }
    if (e.hp < e.maxHp) hpBar(ctx, e.x - 10, e.y - def.radius - 7, 20, e.hp / e.maxHp);
  }
}

function drawEffects(ctx, state) {
  for (const fx of state.effects) {
    const a = Math.max(0, fx.ttl / fx.maxTtl);
    if (fx.kind === 'tracer') {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
    } else if (fx.kind === 'burst') {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1.2 - a * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// --- Screen space -------------------------------------------------------

function drawOffscreenIndicators(ctx, state, cam, W, time) {
  for (const e of state.enemies) {
    const sx = (e.x - cam.x) * cam.scale;
    const sy = e.y * cam.scale;
    let edge = 0;
    if (sx < 0) edge = -1;
    else if (sx > W) edge = 1;
    if (!edge) continue;
    const rusher = e.type === 'rusher';
    const size = rusher ? 11 : 7;
    const x = edge < 0 ? 8 : W - 8;
    const y = Math.max(12, Math.min(cam.viewH * cam.scale - 12, sy));
    ctx.fillStyle = rusher && Math.sin(time * 14) > 0 ? '#ffffff' : state.config.enemies[e.type].color;
    ctx.beginPath();
    ctx.moveTo(x + edge * size * 0.2, y);
    ctx.lineTo(x - edge * size, y - size * 0.8);
    ctx.lineTo(x - edge * size, y + size * 0.8);
    ctx.closePath();
    ctx.fill();
  }
}

function renderMinimap(ctx, canvas, state, cam, dpr) {
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pad = 30;
  const start = state.level.startX - 300;
  const end = state.level.exitX;
  const sx = (x) => pad + ((x - start) / (end - start)) * (W - pad * 2);
  const mid = H / 2;

  ctx.fillStyle = '#ffffff10';
  ctx.fillRect(Math.max(0, sx(cam.x)), 2, (cam.viewW / (end - start)) * (W - pad * 2), H - 4);

  ctx.fillStyle = '#6b665a';
  ctx.fillRect(pad, mid - 1, W - pad * 2, 2);

  for (const n of state.nodes) {
    const x = sx(n.x);
    const y = 3 + (n.y / state.config.world.height) * (H - 6);
    ctx.globalAlpha = n.amount > 0 ? 1 : 0.2;
    ctx.fillStyle = n.kind === 'fuel' ? COLORS.fuel : COLORS.scrap;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.text;
  ctx.fillRect(sx(end) - 1, 2, 3, H - 4);
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('EXIT', sx(end) + 5, mid + 3);

  ctx.fillStyle = state.config.cars.locomotive.color;
  const tx0 = sx(trainTail(state));
  const tx1 = sx(state.train.head);
  ctx.fillRect(tx0, mid - 4, Math.max(4, tx1 - tx0), 8);
}

// --- Helpers ------------------------------------------------------------

function hpBar(ctx, x, y, w, frac) {
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = '#000a';
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = frac > 0.6 ? COLORS.hpGood : frac > 0.3 ? COLORS.hpMid : COLORS.hpBad;
  ctx.fillRect(x, y, w * frac, 4);
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
