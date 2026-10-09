// Browser entry point: level select → depot → play, wiring simulation, renderer, HUD and input.

import { CONFIG } from './config.js';
import { LEVELS } from './data/levels.js';
import { createGame, step, debugAddFuel, debugDamageEngine, debugToggleSpawns, debugToggleFog } from './sim/game.js';
import { setTrainRunning, repairCar, repairVehicle } from './sim/train.js';
import { recallAll, aliveCrew, deployVehicle, findUnit, isSelectable } from './sim/units.js';
import { moveCar, detachRear } from './sim/consist.js';
import { pushMessage } from './sim/state.js';
import {
  createLoadout, addCar, removeCar, shiftCar, canAdd, loadoutCost, loadoutRemaining, loadoutWeight, loadoutBurn,
} from './sim/loadout.js';
import { createRenderer } from './render/renderer.js';
import { createCamera, updateCamera, snapCamera } from './render/camera.js';
import { createHud } from './render/hud.js';
import { bindInput } from './input.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);

const canvas = $('game');
const minimap = $('minimap');
const overlays = { menu: $('menu'), depot: $('depot'), help: $('help'), end: $('end') };

let state = null;
let level = LEVELS[0];
const loadouts = {}; // last loadout per level id
const ui = { selected: new Set(), selectedCarId: null, hover: null, paused: false, timeScale: 1, placing: null, mouseWorld: null };
const cam = createCamera(CONFIG);
const renderer = createRenderer(canvas, minimap);

// --- Actions --------------------------------------------------------------

const actions = {
  toggleTrain() {
    if (!state || state.outcome) return;
    setTrainRunning(state, !state.train.running);
  },
  selectUnit(id, additive) {
    if (!additive) ui.selected.clear();
    if (additive && ui.selected.has(id)) ui.selected.delete(id);
    else ui.selected.add(id);
    ui.selectedCarId = null;
  },
  selectCar(id) {
    ui.selected.clear();
    ui.selectedCarId = id;
  },
  recall() { if (state) recallAll(state); },
  repair() {
    if (!state || ui.selectedCarId == null) return;
    const res = repairCar(state, ui.selectedCarId);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  },
  repairVehicle() {
    if (!state || ui.selectedCarId == null) return;
    const res = repairVehicle(state, ui.selectedCarId);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  },
  moveSelectedCar(dir) {
    if (!state || ui.selectedCarId == null || state.outcome) return;
    const res = moveCar(state, ui.selectedCarId, dir);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
  },
  detachRear() {
    if (!state || state.outcome) return;
    const res = detachRear(state);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
    else if (res.car.id === ui.selectedCarId) ui.selectedCarId = null;
  },
  buildSentry() {
    if (!state) return;
    const crew = [...ui.selected].map((id) => findUnit(state, id)).filter((u) => u && u.kind === 'crew');
    if (!crew.length) {
      pushMessage(state, 'Select crew first, then press B', 'bad');
      return;
    }
    if (!state.train.cars.some((c) => c.kits != null)) {
      pushMessage(state, 'You need an armoury car for sentry kits', 'bad');
      return;
    }
    ui.placing = 'sentry';
  },
  deployVehicle() {
    if (!state) return;
    let car = state.train.cars.find((c) => c.id === ui.selectedCarId && state.config.cars[c.type].vehicle);
    if (!car) {
      car = state.train.cars.find((c) => {
        const v = state.vehicles.find((x) => x.id === c.vehicleId);
        return v && !v.deployed;
      });
    }
    if (!car) {
      pushMessage(state, 'No vehicle ready in a bay', 'bad');
      return;
    }
    const preferred = [...ui.selected][0] ?? null;
    const res = deployVehicle(state, car.id, preferred);
    if (!res.ok) pushMessage(state, res.reason, 'bad');
    else {
      ui.selected.clear();
      ui.selected.add(res.vehicle.id);
      ui.selectedCarId = null;
    }
  },
  isOverlayOpen: () => Object.values(overlays).some((o) => !o.hidden),
  toggleHelp() { overlays.help.hidden = !overlays.help.hidden; },
  closeHelp() { overlays.help.hidden = true; },
  debugFuel: () => state && debugAddFuel(state),
  debugEngine: () => state && debugDamageEngine(state),
  debugSpawns: () => state && debugToggleSpawns(state),
  debugFog: () => state && debugToggleFog(state),
};

const hud = createHud({
  onToggleTrain: actions.toggleTrain,
  onRecall: actions.recall,
  onRepair: actions.repair,
  onRepairVehicle: actions.repairVehicle,
  onSelectUnit: actions.selectUnit,
  onSelectCar: actions.selectCar,
  onMoveCar: actions.moveSelectedCar,
  onDetach: actions.detachRear,
  onBuildSentry: actions.buildSentry,
  onDeployVehicle: actions.deployVehicle,
});

bindInput({ canvas, minimap, getState: () => state, ui, cam, actions });

// Console access for playtesting/tuning, e.g. `__train.state().fuel = 100`.
window.__train = { state: () => state, ui, cam, config: CONFIG, levels: LEVELS };

// --- Screens --------------------------------------------------------------

function show(name) {
  for (const [k, el] of Object.entries(overlays)) if (k !== 'help') el.hidden = k !== name;
}

function buildMenu() {
  const list = $('level-list');
  list.innerHTML = '';
  for (const l of LEVELS) {
    const b = document.createElement('button');
    b.className = 'level-card';
    const enemies = [...new Set(l.enemyTable.map((e) => CONFIG.enemies[e.type].label))].join(', ');
    const nests = l.zones.reduce((n, z) => n + (z.nests ?? 0), 0);
    b.innerHTML = `
      <span class="diff ${l.difficulty}">${l.difficulty}</span>
      <span class="name"></span>
      <span class="blurb"></span>
      <span class="facts">${Math.round(l.exitX / CONFIG.world.pxPerMeter)} m · ${l.crew.length} crew · ${l.budget} scrap to spend · ${nests} nests<br>Enemies: ${enemies}</span>`;
    b.querySelector('.name').textContent = l.name;
    b.querySelector('.blurb').textContent = l.blurb;
    b.addEventListener('click', () => openDepot(l));
    list.appendChild(b);
  }
}

function buildEnemyLegend() {
  const ul = $('enemy-legend');
  ul.innerHTML = '';
  const add = (color, name, text) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="legend" style="background:${color}"></span><b></b>: <span></span>`;
    li.querySelector('b').textContent = name;
    li.querySelector('span:last-child').textContent = text;
    ul.appendChild(li);
  };
  for (const [, def] of Object.entries(CONFIG.enemies)) {
    if (typeof def === 'object' && def.label) add(def.color, def.label, def.blurb);
  }
  add(CONFIG.nest.color, CONFIG.nest.label, CONFIG.nest.blurb);
}

// --- Depot ----------------------------------------------------------------

let loadout = null;
const CATEGORY_ORDER = ['weapon', 'defense', 'utility', 'vehicle'];

function openDepot(l) {
  level = l;
  loadout = loadouts[l.id] ? { cars: [...loadouts[l.id]], budget: l.budget } : createLoadout(CONFIG, l);
  $('depot-title').textContent = `Depot — ${l.name} (${l.difficulty})`;
  $('depot-blurb').textContent = `${l.blurb} Unspent scrap comes with you for repairs.`;
  renderDepot();
  show('depot');
}

function renderDepot() {
  const cat = $('catalog');
  cat.innerHTML = '';
  const types = Object.keys(CONFIG.cars).filter((t) => t !== 'locomotive')
    .sort((a, b) => CATEGORY_ORDER.indexOf(CONFIG.cars[a].category) - CATEGORY_ORDER.indexOf(CONFIG.cars[b].category));
  for (const t of types) {
    const def = CONFIG.cars[t];
    const b = document.createElement('button');
    b.className = 'shop-item';
    const ok = canAdd(CONFIG, loadout, t);
    b.disabled = !ok.ok;
    b.title = ok.ok ? 'Add to the rear of the train' : ok.reason;
    b.innerHTML = `
      <span class="top"><span class="swatch" style="background:${def.color}"></span><span class="n"></span><span class="price">${def.cost}</span></span>
      <span class="meta">${def.category} · ${def.hp} HP · weight ${def.weight}</span>
      <span class="role"></span>`;
    b.querySelector('.n').textContent = def.label;
    b.querySelector('.role').textContent = def.role;
    b.addEventListener('click', () => {
      addCar(CONFIG, loadout, t);
      renderDepot();
    });
    cat.appendChild(b);
  }

  const list = $('depot-train');
  list.innerHTML = '';
  loadout.cars.forEach((t, i) => {
    const def = CONFIG.cars[t];
    const row = document.createElement('div');
    row.className = 'train-item';
    row.innerHTML = `<span class="swatch" style="background:${def.color}"></span><span class="n"></span><span class="dim">${def.cost || ''}</span>`;
    row.querySelector('.n').textContent = `${i + 1}. ${def.label}${i === 0 ? ' (front)' : i === loadout.cars.length - 1 ? ' (rear)' : ''}`;
    const up = document.createElement('button');
    up.textContent = '▲';
    up.title = 'Toward the front';
    up.disabled = i === 0;
    up.addEventListener('click', () => { shiftCar(loadout, i, -1); renderDepot(); });
    const down = document.createElement('button');
    down.textContent = '▼';
    down.title = 'Toward the rear';
    down.disabled = i === loadout.cars.length - 1;
    down.addEventListener('click', () => { shiftCar(loadout, i, 1); renderDepot(); });
    const rm = document.createElement('button');
    rm.textContent = '✕';
    rm.title = 'Sell back';
    rm.disabled = t === 'locomotive';
    rm.addEventListener('click', () => { removeCar(CONFIG, loadout, i); renderDepot(); });
    row.append(up, down, rm);
    list.appendChild(row);
  });

  const burn = loadoutBurn(CONFIG, loadout);
  const range = ((level.startFuel ?? CONFIG.train.startFuel) / burn) * 100 / CONFIG.world.pxPerMeter;
  const capacity = CONFIG.train.engineFuelCapacity + loadout.cars.reduce((n, t) => n + (CONFIG.cars[t].fuelCapacity ?? 0), 0);
  const rows = [
    ['Budget', `${loadout.budget} scrap`],
    ['Spent', `${loadoutCost(CONFIG, loadout)} scrap`],
    ['Starting scrap', `${loadoutRemaining(CONFIG, loadout)} (for repairs)`],
    ['Cars', `${loadout.cars.length} / ${CONFIG.train.maxCars}`],
    ['Total weight', loadoutWeight(CONFIG, loadout).toFixed(1)],
    ['Fuel burn', `${burn.toFixed(2)} per 10 m`],
    ['Fuel capacity', `${capacity}`],
    ['Starting fuel', `${level.startFuel} → about ${Math.round(range)} m of ${Math.round(level.exitX / CONFIG.world.pxPerMeter)} m`],
  ];
  const sum = $('depot-summary');
  sum.innerHTML = '';
  for (const [k, v] of rows) {
    const a = document.createElement('span');
    a.className = 'k';
    a.textContent = k;
    const b = document.createElement('span');
    b.textContent = v;
    sum.append(a, b);
  }
}

function startRun() {
  loadouts[level.id] = [...loadout.cars];
  state = createGame(CONFIG, level, { loadout: [...loadout.cars], scrap: loadoutRemaining(CONFIG, loadout) });
  ui.selected.clear();
  ui.selectedCarId = null;
  ui.paused = false;
  ui.placing = null;
  cam.viewH = CONFIG.camera.defaultViewHeight;
  updateCamera(cam, state, canvas.clientWidth, canvas.clientHeight, 0);
  snapCamera(cam, state);
  show(null);
}

$('depot-start').addEventListener('click', startRun);
$('depot-reset').addEventListener('click', () => { loadout = createLoadout(CONFIG, level); renderDepot(); });
$('depot-back').addEventListener('click', () => show('menu'));
$('help-btn').addEventListener('click', actions.toggleHelp);
$('menu-help').addEventListener('click', actions.toggleHelp);
$('help-close').addEventListener('click', actions.closeHelp);
$('end-retry').addEventListener('click', () => { loadout = { cars: [...loadouts[level.id]], budget: level.budget }; startRun(); });
$('end-depot').addEventListener('click', () => openDepot(level));
$('end-menu').addEventListener('click', () => { state = null; show('menu'); });
$('end-next').addEventListener('click', () => {
  const next = LEVELS[LEVELS.indexOf(level) + 1];
  if (next) openDepot(next);
});

function showEnd() {
  const o = state.outcome;
  const title = $('end-title');
  title.textContent = o.result === 'win' ? `${level.name}: made it through` : `${level.name}: run over`;
  title.className = o.result;
  $('end-reason').textContent = o.reason;
  const s = state.stats;
  $('end-stats').textContent =
    `Time ${formatTime(state.time)} · crew alive ${aliveCrew(state).length}/${state.crew.length} · ` +
    `kills ${s.kills} · nests destroyed ${s.nestsDestroyed} · fuel hauled ${Math.round(s.fuelGathered)} · scrap hauled ${Math.round(s.scrapGathered)} · ` +
    `cars salvaged ${s.salvaged} · survivors rescued ${s.rescued} · barricades rammed ${s.barricadesRammed} / cleared ${s.barricadesCleared} · ` +
    `final train: ${state.train.cars.map((c) => CONFIG.cars[c.type].short).reverse().join(' – ')} ▶`;
  $('end-next').hidden = !(o.result === 'win' && LEVELS[LEVELS.indexOf(level) + 1]);
  show('end');
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Loop -------------------------------------------------------------------

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (state) {
    for (const id of ui.selected) if (!isSelectable(findUnit(state, id))) ui.selected.delete(id);
    if (ui.selectedCarId != null && !state.train.cars.some((c) => c.id === ui.selectedCarId)) ui.selectedCarId = null;

    const running = !ui.paused && overlays.help.hidden && overlays.end.hidden && overlays.menu.hidden && overlays.depot.hidden && !state.outcome;
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
    renderer.render(state, ui, cam, now / 1000);
    hud.update(state, ui);
  }
  requestAnimationFrame(frame);
}

buildMenu();
buildEnemyLegend();
show('menu');
requestAnimationFrame(frame);
