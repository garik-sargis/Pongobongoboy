// Mouse and keyboard → game commands. Desktop only.

import { screenToWorld, snapCamera, clampCamera, zoomCamera } from './render/camera.js';
import { minimapTransform } from './render/renderer.js';
import { unitList } from './render/hud.js';
import { carRect } from './sim/train.js';
import { orderUnit, activeUnits, unitStats, findUnit } from './sim/units.js';
import { isExplored } from './sim/fog.js';
import { pushMessage, dist } from './sim/state.js';

// What is under a world point. Units first, then sites, then the train.
export function hitTest(state, x, y) {
  for (const u of activeUnits(state)) {
    if (dist(x, y, u.x, u.y) <= unitStats(state, u).radius + 5) return { kind: 'unit', id: u.id };
  }
  for (const c of state.crew) {
    if (c.alive && c.aboard && dist(x, y, c.x, c.y) <= 7) return { kind: 'unit', id: c.id };
  }
  const known = (px, py) => isExplored(state, px, py);
  for (const s of state.sentries) {
    if (s.hp > 0 && dist(x, y, s.x, s.y) <= s.radius + 6) return { kind: 'sentry', id: s.id };
  }
  for (const sv of state.survivors) {
    if (!sv.rescued && known(sv.x, sv.y) && dist(x, y, sv.x, sv.y) <= 16) return { kind: 'survivor', id: sv.id };
  }
  for (const n of state.nodes) {
    if (n.amount > 0 && known(n.x, n.y) && dist(x, y, n.x, n.y) <= n.radius + 6) return { kind: 'node', id: n.id };
  }
  for (const n of state.nests) {
    if (known(n.x, n.y) && dist(x, y, n.x, n.y) <= n.radius + 6) return { kind: 'nest', id: n.id };
  }
  for (const b of state.barricades) {
    if (!b.broken && x >= b.x - 10 && x <= b.x + 34 && Math.abs(y - b.y) <= 40) return { kind: 'barricade', id: b.id };
  }
  for (const w of state.wrecks) {
    if (!w.done && known(w.x, w.y) && Math.abs(x - w.x) <= 38 && Math.abs(y - w.y) <= 24) return { kind: 'wreck', id: w.id };
  }
  for (let i = 0; i < state.train.cars.length; i++) {
    const r = carRect(state, i);
    if (x >= r.x0 - 4 && x <= r.x1 + 4 && y >= r.y0 - 6 && y <= r.y1 + 6) {
      return { kind: 'car', id: state.train.cars[i].id };
    }
  }
  return { kind: 'ground' };
}

export function issueOrder(state, ui, x, y) {
  const hit = hitTest(state, x, y);
  const ids = [...ui.selected];
  ids.forEach((id, i) => {
    let order;
    if (['node', 'barricade', 'wreck', 'survivor', 'sentry'].includes(hit.kind)) {
      order = { type: 'work', kind: hit.kind, id: hit.id };
    } else if (hit.kind === 'car') {
      order = { type: 'board' };
    } else if (hit.kind === 'nest') {
      // Attack a nest: stop at weapon range instead of walking into it.
      const u = findUnit(state, id);
      const n = state.nests.find((m) => m.id === hit.id);
      const range = (u && unitStats(state, u).weapon?.range) ?? 120;
      const d = Math.max(1, dist(u.x, u.y, n.x, n.y));
      const keep = n.radius + range * 0.8;
      order = { type: 'move', x: n.x + ((u.x - n.x) / d) * keep, y: n.y + ((u.y - n.y) / d) * keep };
    } else {
      const spread = (i - (ids.length - 1) / 2) * 24;
      order = { type: 'move', x, y: y + spread };
    }
    const res = orderUnit(state, id, order);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  });
}

function placeSentry(state, ui, x, y) {
  const crew = [...ui.selected].map((id) => findUnit(state, id)).filter((u) => u && u.kind === 'crew' && u.alive);
  if (!crew.length) return;
  // Prefer someone already holding a kit, then whoever is closest.
  crew.sort((a, b) => (b.kit - a.kit) || dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
  const res = orderUnit(state, crew[0].id, { type: 'deploy', x, y });
  if (!res.ok) pushMessage(state, res.reason, 'bad');
}

export function bindInput({ canvas, minimap, getState, ui, cam, actions }) {
  const keysDown = new Set();

  function worldPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(cam, ev.clientX - rect.left, ev.clientY - rect.top);
  }

  canvas.addEventListener('mousemove', (ev) => {
    const state = getState();
    if (!state) return;
    const p = worldPoint(ev);
    ui.mouseWorld = p;
    ui.hover = hitTest(state, p.x, p.y);
  });
  canvas.addEventListener('mouseleave', () => {
    ui.hover = null;
    ui.mouseWorld = null;
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  canvas.addEventListener('mousedown', (ev) => {
    const state = getState();
    if (!state || state.outcome) return;
    const p = worldPoint(ev);
    const hit = hitTest(state, p.x, p.y);

    if (ui.placing) {
      if (ev.button === 0) placeSentry(state, ui, p.x, p.y);
      ui.placing = null;
      return;
    }
    if (ev.button === 2) {
      if (ui.selected.size) issueOrder(state, ui, p.x, p.y);
      return;
    }
    if (ev.button !== 0) return;

    if (hit.kind === 'unit') {
      actions.selectUnit(hit.id, ev.shiftKey);
    } else if (ui.selected.size) {
      issueOrder(state, ui, p.x, p.y);
    } else if (hit.kind === 'car') {
      actions.selectCar(hit.id);
    } else {
      ui.selectedCarId = null;
    }
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const state = getState();
    if (!state) return;
    const rect = canvas.getBoundingClientRect();
    const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
    zoomCamera(cam, state, factor, ev.clientX - rect.left, ev.clientY - rect.top, state.config.camera);
  }, { passive: false });

  minimap.addEventListener('mousedown', (ev) => {
    const state = getState();
    if (!state) return;
    const rect = minimap.getBoundingClientRect();
    const t = minimapTransform(state, rect.width, rect.height);
    cam.follow = false;
    cam.x = t.wx(ev.clientX - rect.left) - cam.viewW / 2;
    cam.y = t.wy(ev.clientY - rect.top) - cam.viewH / 2;
    clampCamera(cam, state);
  });

  function updatePan() {
    const left = keysDown.has('a') || keysDown.has('arrowleft');
    const right = keysDown.has('d') || keysDown.has('arrowright');
    const up = keysDown.has('w') || keysDown.has('arrowup');
    const down = keysDown.has('s') || keysDown.has('arrowdown');
    cam.panX = (right ? 1 : 0) - (left ? 1 : 0);
    cam.panY = (down ? 1 : 0) - (up ? 1 : 0);
  }

  window.addEventListener('keydown', (ev) => {
    const key = ev.key.toLowerCase();
    if (ev.target instanceof HTMLButtonElement && (key === ' ' || key === 'enter')) ev.preventDefault();
    if (actions.isOverlayOpen()) {
      if (key === 'escape' || key === 'h') actions.closeHelp();
      return;
    }
    const state = getState();
    if (!state) return;
    if (key.startsWith('arrow')) ev.preventDefault();
    keysDown.add(key);
    updatePan();
    if (ev.repeat) return;
    switch (key) {
      case ' ': ev.preventDefault(); actions.toggleTrain(); break;
      case '1': case '2': case '3': case '4': case '5': case '6': {
        const u = unitList(state)[Number(key) - 1];
        if (u && (u.kind === 'vehicle' || u.alive)) actions.selectUnit(u.id, ev.shiftKey);
        break;
      }
      case 'r': actions.recall(); break;
      case 'q': actions.moveSelectedCar(1); break;   // left on screen = toward the rear
      case 'e': actions.moveSelectedCar(-1); break;  // right on screen = toward the front
      case 'x': actions.detachRear(); break;
      case 'b': actions.buildSentry(); break;
      case 'v': actions.deployVehicle(); break;
      case 'f': snapCamera(cam, state); break;
      case 'escape': ui.placing = null; ui.selected.clear(); ui.selectedCarId = null; break;
      case 'h': actions.toggleHelp(); break;
      case 'p': ui.paused = !ui.paused; break;
      case 'g': actions.debugFuel(); break;
      case 'k': actions.debugEngine(); break;
      case 'n': actions.debugSpawns(); break;
      case 'm': actions.debugFog(); break;
      case 't': ui.timeScale = ui.timeScale === 1 ? 2 : 1; pushMessage(state, `[debug] speed ${ui.timeScale}×`); break;
      default: break;
    }
  });
  window.addEventListener('keyup', (ev) => {
    keysDown.delete(ev.key.toLowerCase());
    updatePan();
  });
  window.addEventListener('blur', () => {
    keysDown.clear();
    updatePan();
  });
}
