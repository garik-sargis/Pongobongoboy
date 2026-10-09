// Browser entry point: wires simulation, renderer, HUD and input together
// and runs a fixed-timestep loop.

import { CONFIG } from './config.js';
import { LEVEL_1 } from './level.js';
import { createGame, step, debugAddFuel, debugDamageEngine, debugToggleSpawns } from './sim/game.js';
import { setTrainRunning, repairCar } from './sim/train.js';
import { recallAll, aliveCrew } from './sim/crew.js';
import { moveCar, detachRear } from './sim/consist.js';
import { pushMessage } from './sim/state.js';
import { createRenderer } from './render/renderer.js';
import { createCamera, updateCamera, snapCamera } from './render/camera.js';
import { createHud } from './render/hud.js';
import { bindInput } from './input.js';

const STEP = 1 / 60;

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const helpEl = document.getElementById('help');
const endEl = document.getElementById('end');

let state = createGame(CONFIG, LEVEL_1);
const ui = { selectedCrew: new Set(), selectedCarId: null, hover: null, paused: false, timeScale: 1 };
const cam = createCamera();
const renderer = createRenderer(canvas, minimap, LEVEL_1, CONFIG);

const actions = {
  toggleTrain() {
    if (state.outcome) return;
    setTrainRunning(state, !state.train.running);
  },
  selectCrew(id, additive) {
    if (!additive) ui.selectedCrew.clear();
    if (additive && ui.selectedCrew.has(id)) ui.selectedCrew.delete(id);
    else ui.selectedCrew.add(id);
    ui.selectedCarId = null;
  },
  recall() { recallAll(state); },
  repair() {
    if (ui.selectedCarId == null) return;
    const res = repairCar(state, ui.selectedCarId);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  },
  selectCar(id) {
    ui.selectedCrew.clear();
    ui.selectedCarId = id;
  },
  moveSelectedCar(dir) {
    if (ui.selectedCarId == null || state.outcome) return;
    const res = moveCar(state, ui.selectedCarId, dir);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  },
  detachRear() {
    if (state.outcome) return;
    const res = detachRear(state);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
    else if (res.car.id === ui.selectedCarId) ui.selectedCarId = null;
  },
  isHelpOpen: () => !helpEl.hidden,
  toggleHelp() { helpEl.hidden = !helpEl.hidden; },
  closeHelp() { helpEl.hidden = true; },
  debugFuel: () => debugAddFuel(state),
  debugEngine: () => debugDamageEngine(state),
  debugSpawns: () => debugToggleSpawns(state),
};

const hud = createHud({
  onToggleTrain: actions.toggleTrain,
  onRecall: actions.recall,
  onRepair: actions.repair,
  onSelectCrew: actions.selectCrew,
  onSelectCar: actions.selectCar,
  onMoveCar: actions.moveSelectedCar,
  onDetach: actions.detachRear,
});

bindInput({ canvas, minimap, getState: () => state, ui, cam, actions });

// Console access for playtesting/tuning, e.g. `__train.state().fuel = 100`.
window.__train = { state: () => state, ui, cam, config: CONFIG };

document.getElementById('help-btn').addEventListener('click', actions.toggleHelp);
document.getElementById('help-close').addEventListener('click', actions.closeHelp);
document.getElementById('restart').addEventListener('click', restart);

function restart() {
  state = createGame(CONFIG, LEVEL_1);
  ui.selectedCrew.clear();
  ui.selectedCarId = null;
  ui.paused = false;
  endEl.hidden = true;
  snapCamera(cam, state);
}

function showEnd() {
  const o = state.outcome;
  const title = document.getElementById('end-title');
  title.textContent = o.result === 'win' ? 'You made it through' : 'Run over';
  title.className = o.result;
  document.getElementById('end-reason').textContent = o.reason;
  const s = state.stats;
  document.getElementById('end-stats').textContent =
    `Time ${formatTime(state.time)} · crew alive ${aliveCrew(state).length}/${state.crew.length} · ` +
    `kills ${s.kills} · fuel gathered ${Math.round(s.fuelGathered)} · scrap gathered ${Math.round(s.scrapGathered)} · ` +
    `cars salvaged ${s.salvaged} · survivors rescued ${s.rescued} · barricades rammed ${s.barricadesRammed} / cleared ${s.barricadesCleared} · ` +
    `final train: ${state.train.cars.map((c) => CONFIG.cars[c.type].label.replace(' car', '')).reverse().join(' – ')} ▶`;
  endEl.hidden = false;
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

let last = performance.now();
let acc = 0;
let firstFrame = true;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Drop selections of dead crew.
  for (const id of ui.selectedCrew) {
    const c = state.crew.find((m) => m.id === id);
    if (!c || !c.alive) ui.selectedCrew.delete(id);
  }

  const running = !ui.paused && helpEl.hidden && !state.outcome;
  if (running) {
    acc += dt * ui.timeScale;
    while (acc >= STEP) {
      step(state, STEP);
      acc -= STEP;
    }
    if (state.outcome) showEnd();
  } else {
    acc = 0;
  }

  updateCamera(cam, state, canvas.clientWidth, canvas.clientHeight, dt);
  if (firstFrame) {
    snapCamera(cam, state);
    firstFrame = false;
  }
  renderer.render(state, ui, cam, now / 1000);
  hud.update(state, ui);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
