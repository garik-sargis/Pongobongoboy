// DOM heads-up display: resource readouts, warnings, unit cards, train strip, info panel.

import { fuelCapacity, fuelBurnPer100, isStationary, isCrawling, trainWeight, nextBarricade, ramOutcome } from '../sim/train.js';
import { aliveCrew, crewOutside, deployedVehicles, kitsAvailable, findUnit } from '../sim/units.js';
import { threatFraction, threatTrend } from '../sim/spawner.js';
import { getSite } from '../sim/sites.js';

const $ = (id) => document.getElementById(id);

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function setWidth(el, frac) {
  const w = `${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10}%`;
  if (el.style.width !== w) el.style.width = w;
}

// Selectable units in a stable order: crew (not driving), then deployed vehicles.
export function unitList(state) {
  return [...state.crew.filter((c) => !c.inVehicle), ...deployedVehicles(state)];
}

export function createHud(handlers) {
  const els = {
    levelName: $('level-name'), levelDiff: $('level-diff'),
    fuelBar: $('fuel-bar'), fuelText: $('fuel-text'),
    burnText: $('burn-text'), burnSub: $('burn-sub'),
    engineBar: $('engine-bar'), engineText: $('engine-text'),
    scrapText: $('scrap-text'), kitsText: $('kits-text'),
    crewText: $('crew-text'), crewSub: $('crew-sub'),
    exitText: $('exit-text'),
    threatBar: $('threat-bar'), threatText: $('threat-text'),
    warnings: $('warnings'), messages: $('messages'),
    go: $('go'), unitCards: $('unit-cards'),
    infoTitle: $('info-title'), infoDesc: $('info-desc'), repair: $('repair'), repairVehicle: $('repair-vehicle'),
    toFront: $('to-front'), toRear: $('to-rear'), detach: $('detach'), consist: $('consist'),
    buildSentry: $('build-sentry'), deployVehicle: $('deploy-vehicle'),
    paused: $('paused'),
  };
  let cardsKey = '';
  let consistKey = '';
  let lastWarnings = '';
  let lastMessages = '';

  els.go.addEventListener('click', handlers.onToggleTrain);
  $('recall').addEventListener('click', handlers.onRecall);
  els.repair.addEventListener('click', handlers.onRepair);
  els.repairVehicle.addEventListener('click', handlers.onRepairVehicle);
  els.toFront.addEventListener('click', () => handlers.onMoveCar(-1));
  els.toRear.addEventListener('click', () => handlers.onMoveCar(1));
  els.detach.addEventListener('click', handlers.onDetach);
  els.buildSentry.addEventListener('click', handlers.onBuildSentry);
  els.deployVehicle.addEventListener('click', handlers.onDeployVehicle);

  function buildCards(state, units) {
    els.unitCards.innerHTML = '';
    units.forEach((u, i) => {
      const b = document.createElement('button');
      b.className = 'unit-card' + (u.kind === 'vehicle' ? ' vehicle' : '');
      b.dataset.id = u.id;
      b.innerHTML = `<div class="row"><b></b>${i < 6 ? `<kbd>${i + 1}</kbd>` : ''}</div><div class="meter"><i></i></div><div class="status"></div>`;
      b.querySelector('b').textContent = u.kind === 'vehicle' ? state.config.vehicles[u.type].label : u.name;
      b.addEventListener('click', (ev) => handlers.onSelectUnit(u.id, ev.shiftKey));
      els.unitCards.appendChild(b);
    });
  }

  function updateConsist(state, ui) {
    const cars = state.train.cars;
    const key = cars.map((c) => `${c.id}:${Math.ceil(c.hp)}`).join(',') + `|${ui.selectedCarId}`;
    if (key === consistKey) return;
    consistKey = key;
    els.consist.innerHTML = '';
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const def = state.config.cars[car.type];
      const b = document.createElement('button');
      b.className = 'chip' + (ui.selectedCarId === car.id ? ' selected' : '') + (car.hp <= 0 ? ' dead' : '');
      b.title = `${def.label} — ${Math.ceil(car.hp)}/${car.maxHp} HP`;
      b.innerHTML = `<span class="swatch" style="background:${def.color}"></span>${def.short}<span class="hp"><i style="width:${(car.hp / car.maxHp) * 100}%"></i></span>`;
      b.addEventListener('click', () => handlers.onSelectCar(car.id));
      els.consist.appendChild(b);
    }
  }

  function unitStatus(state, u) {
    const leftBehind = state.train.running && !isStationary(state) && (u.kind === 'vehicle' || !u.aboard) ? ' — LEFT BEHIND' : '';
    if (u.kind === 'crew') {
      if (!u.alive) return 'Dead';
      if (u.aboard) return 'Aboard';
    }
    const carry = u.carry ? ` [${Math.floor(u.carry.amount)} ${u.carry.kind}]` : '';
    const kit = u.kit ? ' [kit]' : '';
    if (!u.order) return (u.fighting ? 'Fighting' : 'Idle outside') + carry + kit + leftBehind;
    const o = u.order;
    if (o.type === 'board') return (u.kind === 'vehicle' ? 'Docking' : 'Returning') + carry + kit + leftBehind;
    if (o.type === 'move') return 'Moving' + carry + kit + leftBehind;
    if (o.type === 'deploy') return (u.kit ? (u.working ? 'Building sentry' : 'Carrying kit') : 'Fetching kit') + leftBehind;
    if (u.blocked === 'full') return 'Tanks full — waiting' + carry;
    if (u.blocked === 'needTrain') return 'Salvage: stop the train nearby';
    if (u.blocked === 'fighting') return 'Fighting (work paused)' + carry;
    if (o.kind === 'node') {
      const site = getSite(state, o);
      const kind = u.carry?.kind ?? site?.kind ?? '';
      return (o.phase === 'deliver' ? `Hauling ${kind}` : u.working ? `Digging ${kind}` : `Going to ${kind}`) + carry + leftBehind;
    }
    const verb = { wreck: 'Salvaging', barricade: 'Clearing barricade', survivor: 'Rescuing', sentry: 'Packing sentry' }[o.kind];
    return (u.working ? verb : `Going: ${verb.toLowerCase()}`) + leftBehind;
  }

  function update(state, ui) {
    const cfg = state.config;
    setText(els.levelName, state.level.name);
    setText(els.levelDiff, state.level.difficulty ?? 'Level');

    const units = unitList(state);
    const key = units.map((u) => u.id).join(',');
    if (key !== cardsKey) {
      cardsKey = key;
      buildCards(state, units);
    }
    updateConsist(state, ui);

    // Fuel & burn
    const cap = fuelCapacity(state);
    setWidth(els.fuelBar, state.fuel / cap);
    setText(els.fuelText, `${state.fuel.toFixed(1)} / ${cap}`);
    const burn = fuelBurnPer100(state);
    setText(els.burnText, `${burn.toFixed(2)} / ${100 / cfg.world.pxPerMeter} m`);
    const moving = !isStationary(state);
    setText(els.burnSub,
      isCrawling(state) ? 'EMPTY — crawling'
        : `${moving ? 'burning' : 'idle'} · ${state.train.cars.length} cars, wt ${trainWeight(state).toFixed(1)}`);
    els.burnSub.style.color = moving && !isCrawling(state) ? 'var(--fuel)' : isCrawling(state) ? 'var(--bad)' : '';

    const loco = state.train.cars.find((c) => c.type === 'locomotive');
    setWidth(els.engineBar, loco.hp / loco.maxHp);
    setText(els.engineText, `${Math.ceil(loco.hp)} / ${loco.maxHp} HP`);

    setText(els.scrapText, `${Math.floor(state.scrap)}`);
    const kits = state.train.cars.some((c) => c.kits != null) ? `sentry kits: ${kitsAvailable(state)}` : '';
    setText(els.kitsText, kits);
    const alive = aliveCrew(state).length;
    const outside = crewOutside(state).length;
    const driving = state.crew.filter((c) => c.alive && c.inVehicle).length;
    setText(els.crewText, `${alive} / ${state.crew.length}`);
    setText(els.crewSub, [outside ? `${outside} outside` : '', driving ? `${driving} driving` : ''].filter(Boolean).join(', ') || 'all aboard');

    const remaining = Math.max(0, (state.world.length - state.train.head) / cfg.world.pxPerMeter);
    setText(els.exitText, `${Math.round(remaining)} m`);

    // Threat
    const f = threatFraction(state);
    setWidth(els.threatBar, f);
    const color = f < 0.3 ? 'var(--good)' : f < 0.6 ? 'var(--warn)' : 'var(--bad)';
    if (els.threatBar.style.background !== color) els.threatBar.style.background = color;
    const label = f < 0.2 ? 'Calm' : f < 0.45 ? 'Uneasy' : f < 0.7 ? 'Dangerous' : 'Overwhelming';
    const trend = threatTrend(state);
    const trendText = !state.started ? 'waiting to depart'
      : trend > 0 ? '▲ rising — you are stopped'
        : trend < 0 ? '▼ easing — keep moving'
          : isStationary(state) ? 'stopped (rises soon)' : 'steady';
    setText(els.threatText, `${label} · ${trendText}`);
    els.threatText.style.color = trend > 0 ? 'var(--bad)' : '';

    const running = state.train.running;
    els.go.classList.toggle('stop', running);
    const goLabel = running ? 'STOP' : 'GO';
    if (els.go.dataset.label !== goLabel) {
      els.go.dataset.label = goLabel;
      els.go.innerHTML = `${goLabel} <kbd>Space</kbd>`;
    }

    for (const card of els.unitCards.children) {
      const u = findUnit(state, Number(card.dataset.id));
      if (!u) continue;
      const dead = u.kind === 'crew' ? !u.alive : u.destroyed;
      card.classList.toggle('selected', ui.selected.has(u.id));
      card.classList.toggle('dead', dead);
      card.disabled = dead;
      setWidth(card.querySelector('.meter > i'), u.hp / u.maxHp);
      setText(card.querySelector('.status'), unitStatus(state, u));
    }

    updateWarnings(state, cap, loco, moving, f);

    const mKey = state.messages.map((m) => m.text).join('|');
    if (mKey !== lastMessages) {
      lastMessages = mKey;
      els.messages.innerHTML = '';
      for (const m of state.messages) {
        const d = document.createElement('div');
        d.className = `message ${m.tone}`;
        d.textContent = m.text;
        els.messages.appendChild(d);
      }
    }

    const rear = state.train.cars[state.train.cars.length - 1];
    const canDetach = state.train.cars.length > 1 && rear.type !== 'locomotive';
    els.detach.disabled = !canDetach;
    setText(els.detach.firstChild, canDetach ? `Detach ${cfg.cars[rear.type].short} ` : 'Detach rear ');

    updateInfo(state, ui);
    els.paused.hidden = !ui.paused;
  }

  function updateWarnings(state, cap, loco, moving, f) {
    const cfg = state.config;
    const warnings = [];
    const outside = crewOutside(state).length + deployedVehicles(state).length;
    if (outside && moving) warnings.push(['bad', `${outside} unit${outside > 1 ? 's' : ''} outside a moving train!`]);
    if (isCrawling(state)) warnings.push(['bad', 'Out of fuel']);
    else if (state.fuel / cap < 0.2) warnings.push(['caution', 'Low fuel']);
    if (loco.hp / loco.maxHp < 0.35) warnings.push(['bad', 'Locomotive badly damaged']);
    const count = (t) => state.enemies.filter((e) => e.type === t).length;
    if (count('rusher')) warnings.push(['bad', `${count('rusher')} rusher${count('rusher') > 1 ? 's' : ''} incoming`]);
    if (count('brute')) warnings.push(['caution', `Brute${count('brute') > 1 ? 's' : ''} closing in`]);
    const aiming = state.enemies.filter((e) => e.type === 'sniper' && e.aim > 0.3);
    if (aiming.length) warnings.push(['bad', 'Sniper taking aim — move!']);
    if (state.shells.length) warnings.push(['caution', 'Mortar shells incoming']);
    const awake = state.nests.filter((n) => n.awake).length;
    if (awake) warnings.push(['caution', `${awake} nest${awake > 1 ? 's' : ''} awake`]);
    if (f >= 0.7) warnings.push(['bad', 'Threat overwhelming — leave!']);
    const b = nextBarricade(state);
    if (b) {
      const meters = Math.round((b.x - state.train.head) / cfg.world.pxPerMeter);
      const front = cfg.cars[state.train.cars[0].type].label;
      if (state.train.blockedBy === b.id) {
        warnings.push(['bad', b.reinforced ? 'Blocked by a reinforced barricade — dig it out, or put a ram car in front' : 'Blocked by barricade — too slow to ram. Clear it by hand.']);
      } else if (meters <= 100) {
        const out = ramOutcome(state, b);
        warnings.push([!out.breaks || out.damage >= 40 ? 'bad' : 'caution', out.breaks
          ? `Barricade in ${meters} m — ram: -${out.damage} HP to ${front}`
          : `REINFORCED barricade in ${meters} m — it will stop the train`]);
      }
    }
    const ml = state.train.cars.findIndex((c) => c.type === 'mineLayer');
    if (ml >= 0 && ml !== state.train.cars.length - 1) warnings.push(['caution', 'Mine layer only works at the rear']);
    if (state.train.shunting > 0) warnings.push(['caution', 'Shunting cars…']);
    const wKey = warnings.map((w) => w.join(':')).join('|');
    if (wKey !== lastWarnings) {
      lastWarnings = wKey;
      els.warnings.innerHTML = '';
      for (const [tone, text] of warnings) {
        const d = document.createElement('div');
        d.className = `warning ${tone === 'caution' ? 'caution' : ''}`;
        d.textContent = text;
        els.warnings.appendChild(d);
      }
    }
  }

  function hideCarButtons() {
    for (const el of [els.repair, els.toFront, els.toRear, els.deployVehicle, els.repairVehicle]) el.hidden = true;
  }

  function updateInfo(state, ui) {
    const cfg = state.config;
    const car = state.train.cars.find((c) => c.id === ui.selectedCarId);
    els.buildSentry.hidden = true;
    if (car) {
      const def = cfg.cars[car.type];
      const idx = state.train.cars.indexOf(car);
      const last = state.train.cars.length - 1;
      const pos = idx === 0 ? 'front' : idx === last ? 'rear' : `position ${idx + 1}`;
      setText(els.infoTitle, `${def.label} — ${Math.ceil(car.hp)} / ${car.maxHp} HP${car.hp <= 0 ? ' (DISABLED)' : ''} · ${pos} · wt ${def.weight}`);
      let extra = '';
      if (car.type === 'ram') extra = idx === 0 ? ' ✔ Active (at front).' : ' ✘ Inactive — move it to the front.';
      if (car.type === 'mineLayer') extra = idx === last ? ` ✔ Active (rear). Mines out: ${state.mines.length}.` : ' ✘ Inactive — move it to the rear.';
      if (def.shield) extra = ` Shield ${Math.round(car.shield)}/${def.shield.capacity}.`;
      if (def.kits) extra = ` Kits aboard: ${car.kits}/${def.kits}.`;
      if (def.crane) extra = car.craneTarget ? ' Lifting now.' : isStationary(state) ? ' Nothing in reach.' : ' Works while stopped.';
      if (def.vehicle) {
        const v = state.vehicles.find((x) => x.id === car.vehicleId);
        extra = !v ? ' Bay is empty.' : v.deployed ? ` ${cfg.vehicles[v.type].label} is out.` : ` ${cfg.vehicles[v.type].label} docked (${Math.ceil(v.hp)}/${v.maxHp} HP).`;
      }
      setText(els.infoDesc, def.role + extra);

      const stopped = isStationary(state);
      const canShunt = stopped && state.train.shunting === 0;
      els.toFront.hidden = false;
      els.toRear.hidden = false;
      els.toFront.disabled = !canShunt || idx === 0;
      els.toRear.disabled = !canShunt || idx === last;
      els.repair.hidden = false;
      const r = cfg.repair;
      els.repair.disabled = !(stopped && car.hp < car.maxHp && state.scrap >= r.scrapCost);
      const why = !stopped ? ' (stop first)' : car.hp >= car.maxHp ? ' (full)' : state.scrap < r.scrapCost ? ' (need scrap)' : '';
      setText(els.repair, `Repair +${r.hpPerAction} for ${r.scrapCost} scrap${why}`);

      const v = def.vehicle ? state.vehicles.find((x) => x.id === car.vehicleId) : null;
      els.deployVehicle.hidden = !v || v.deployed;
      if (v && !v.deployed) {
        els.deployVehicle.innerHTML = `Deploy ${cfg.vehicles[v.type].label.toLowerCase()} <kbd>V</kbd>`;
        els.deployVehicle.disabled = !stopped || car.hp <= 0 || !state.crew.some((c) => c.alive && c.aboard);
      }
      els.repairVehicle.hidden = !v || v.deployed || v.hp >= v.maxHp;
      if (v) setText(els.repairVehicle, `Repair ${cfg.vehicles[v.type].label.toLowerCase()} +${r.hpPerAction}`);
      els.repairVehicle.disabled = !(stopped && state.scrap >= r.scrapCost);
      return;
    }
    hideCarButtons();
    const sel = [...ui.selected].map((id) => findUnit(state, id)).filter(Boolean);
    if (sel.length) {
      const crewSel = sel.filter((u) => u.kind === 'crew');
      const names = sel.map((u) => (u.kind === 'vehicle' ? cfg.vehicles[u.type].label : u.name)).join(', ');
      setText(els.infoTitle, `Selected: ${names}`);
      const tips = ['Click ground to move', 'a deposit to dig & haul', 'a wreck to salvage', 'a barricade to clear'];
      if (crewSel.length) tips.push('a survivor to rescue', 'your sentry to pack it');
      tips.push('the train to board');
      setText(els.infoDesc, tips.join(' · ') + '.');
      const hasArmory = state.train.cars.some((c) => c.kits != null);
      els.buildSentry.hidden = !crewSel.length || !hasArmory;
      els.buildSentry.disabled = kitsAvailable(state) === 0 && !crewSel.some((c) => c.kit);
    } else {
      setText(els.infoTitle, state.started ? 'Nothing selected' : 'Press Space (or GO) to depart');
      setText(els.infoDesc, 'Select crew with 1–6 or by clicking them. Click a car (or a chip above) to inspect, repair, move it or deploy its vehicle.');
    }
  }

  return { update };
}
