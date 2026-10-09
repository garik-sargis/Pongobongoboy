// Mouse and keyboard → game commands. Desktop only.

import { screenToWorld, snapCamera, clampCamera } from './render/camera.js';
import { carRect } from './sim/train.js';
import { orderCrew } from './sim/crew.js';
import { pushMessage, dist } from './sim/state.js';

// What is under a world point: crew > node > car > ground.
export function hitTest(state, x, y) {
  for (const c of state.crew) {
    if (!c.alive) continue;
    const r = c.aboard ? 7 : state.config.crew.radius + 4;
    if (dist(x, y, c.x, c.y) <= r) return { kind: 'crew', id: c.id };
  }
  for (const n of state.nodes) {
    if (n.amount > 0 && dist(x, y, n.x, n.y) <= n.radius + 6) return { kind: 'node', id: n.id };
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
  const ids = [...ui.selectedCrew];
  ids.forEach((id, i) => {
    let order;
    if (hit.kind === 'node') order = { type: 'gather', nodeId: hit.id };
    else if (hit.kind === 'car') order = { type: 'board' };
    else {
      // Spread a group out slightly so they don't stack.
      const spread = (i - (ids.length - 1) / 2) * 22;
      order = { type: 'move', x, y: y + spread };
    }
    const res = orderCrew(state, id, order);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  });
}

export function bindInput({ canvas, minimap, getState, ui, cam, actions }) {
  const keysDown = new Set();

  function worldPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(cam, ev.clientX - rect.left, ev.clientY - rect.top);
  }

  canvas.addEventListener('mousemove', (ev) => {
    const p = worldPoint(ev);
    ui.hover = hitTest(getState(), p.x, p.y);
  });
  canvas.addEventListener('mouseleave', () => { ui.hover = null; });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  canvas.addEventListener('mousedown', (ev) => {
    const state = getState();
    if (state.outcome) return;
    const p = worldPoint(ev);
    const hit = hitTest(state, p.x, p.y);

    if (ev.button === 2) {
      if (ui.selectedCrew.size) issueOrder(state, ui, p.x, p.y);
      return;
    }
    if (ev.button !== 0) return;

    if (hit.kind === 'crew') {
      actions.selectCrew(hit.id, ev.shiftKey);
    } else if (ui.selectedCrew.size) {
      issueOrder(state, ui, p.x, p.y);
    } else if (hit.kind === 'car') {
      ui.selectedCarId = hit.id;
    } else {
      ui.selectedCarId = null;
    }
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    cam.follow = false;
    cam.x += (ev.deltaY + ev.deltaX) / cam.scale;
    clampCamera(cam, getState());
  }, { passive: false });

  minimap.addEventListener('mousedown', (ev) => {
    const state = getState();
    const rect = minimap.getBoundingClientRect();
    const pad = 30;
    const start = state.level.startX - 300;
    const frac = (ev.clientX - rect.left - pad) / (rect.width - pad * 2);
    cam.follow = false;
    cam.x = start + frac * (state.level.exitX - start) - cam.viewW / 2;
    clampCamera(cam, state);
  });

  function updatePan() {
    const left = keysDown.has('a') || keysDown.has('arrowleft');
    const right = keysDown.has('d') || keysDown.has('arrowright');
    cam.pan = (right ? 1 : 0) - (left ? 1 : 0);
  }

  window.addEventListener('keydown', (ev) => {
    const key = ev.key.toLowerCase();
    if (ev.target instanceof HTMLButtonElement && (key === ' ' || key === 'enter')) ev.preventDefault();
    if (actions.isHelpOpen() && key !== 'h' && key !== 'escape') return;
    keysDown.add(key);
    updatePan();
    if (ev.repeat) return;
    const state = getState();
    switch (key) {
      case ' ': ev.preventDefault(); actions.toggleTrain(); break;
      case '1': case '2': case '3': case '4': {
        const c = state.crew[Number(key) - 1];
        if (c && c.alive) actions.selectCrew(c.id, ev.shiftKey);
        break;
      }
      case 'r': actions.recall(); break;
      case 'f': snapCamera(cam, state); break;
      case 'escape': actions.closeHelp(); ui.selectedCrew.clear(); ui.selectedCarId = null; break;
      case 'h': actions.toggleHelp(); break;
      case 'p': ui.paused = !ui.paused; break;
      case 'g': actions.debugFuel(); break;
      case 'k': actions.debugEngine(); break;
      case 'n': actions.debugSpawns(); break;
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
