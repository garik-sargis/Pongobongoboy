// DOM heads-up display: resource readouts, warnings, crew cards, info panel.

import { fuelCapacity, fuelBurnPer100, isStationary, isCrawling, trainWeight, nextBarricade, ramDamage } from '../sim/train.js';
import { getSite } from '../sim/sites.js';
import { aliveCrew, crewOutside } from '../sim/crew.js';
import { threatFraction, threatTrend } from '../sim/spawner.js';

const $ = (id) => document.getElementById(id);

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function setWidth(el, frac) {
  const w = `${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10}%`;
  if (el.style.width !== w) el.style.width = w;
}

export function createHud(handlers) {
  const els = {
    fuelBar: $('fuel-bar'), fuelText: $('fuel-text'),
    burnText: $('burn-text'), burnSub: $('burn-sub'),
    engineBar: $('engine-bar'), engineText: $('engine-text'),
    scrapText: $('scrap-text'),
    crewText: $('crew-text'), crewSub: $('crew-sub'),
    exitText: $('exit-text'),
    threatBar: $('threat-bar'), threatText: $('threat-text'),
    warnings: $('warnings'), messages: $('messages'),
    go: $('go'), crewCards: $('crew-cards'),
    infoTitle: $('info-title'), infoDesc: $('info-desc'), repair: $('repair'),
    toFront: $('to-front'), toRear: $('to-rear'), detach: $('detach'), consist: $('consist'),
    paused: $('paused'),
  };
  let cardsFor = null;
  let cardsCount = 0;
  let consistKey = '';
  let lastWarnings = '';
  let lastMessages = '';

  els.go.addEventListener('click', handlers.onToggleTrain);
  $('recall').addEventListener('click', handlers.onRecall);
  els.repair.addEventListener('click', handlers.onRepair);
  els.toFront.addEventListener('click', () => handlers.onMoveCar(-1));
  els.toRear.addEventListener('click', () => handlers.onMoveCar(1));
  els.detach.addEventListener('click', handlers.onDetach);

  function buildCards(state) {
    els.crewCards.innerHTML = '';
    state.crew.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'crew-card';
      b.dataset.id = c.id;
      b.innerHTML = `<div class="row"><b>${c.name}</b><kbd>${i + 1}</kbd></div><div class="meter"><i></i></div><div class="status"></div>`;
      b.addEventListener('click', (ev) => handlers.onSelectCrew(c.id, ev.shiftKey));
      els.crewCards.appendChild(b);
    });
    cardsFor = state;
    cardsCount = state.crew.length;
  }

  // Train composition strip, drawn in screen order: rear on the left, front on the right.
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
      b.innerHTML = `<span class="swatch" style="background:${def.color}"></span>${def.label.replace(' car', '')}<span class="hp"><i style="width:${(car.hp / car.maxHp) * 100}%"></i></span>`;
      b.addEventListener('click', () => handlers.onSelectCar(car.id));
      els.consist.appendChild(b);
    }
  }

  function crewStatus(state, c) {
    if (!c.alive) return 'Dead';
    if (c.aboard) return 'Aboard';
    const left = state.train.running && !isStationary(state) ? ' — LEFT BEHIND' : '';
    if (!c.order) return (c.fighting ? 'Fighting' : 'Idle outside') + left;
    if (c.order.type === 'board') return 'Returning to train' + left;
    if (c.order.type === 'move') return 'Moving' + left;
    const site = getSite(state, c.order);
    const what = c.order.kind === 'node' ? (site ? site.kind : '')
      : c.order.kind === 'wreck' ? 'salvage'
        : c.order.kind === 'barricade' ? 'barricade' : 'survivor';
    const verb = c.order.kind === 'node' ? 'Gathering' : c.order.kind === 'wreck' ? 'Salvaging' : 'Clearing';
    if (c.blocked === 'full') return 'Fuel tanks full' + left;
    if (c.blocked === 'needTrain') return 'Salvage: stop the train nearby';
    if (c.blocked === 'fighting') return `Fighting (${what} paused)` + left;
    if (c.working) return `${verb} ${c.order.kind === 'node' ? what : ''}`.trim() + left;
    return `Going to ${what}` + left;
  }

  function update(state, ui) {
    if (cardsFor !== state || cardsCount !== state.crew.length) buildCards(state);
    updateConsist(state, ui);
    const cfg = state.config;

    // Fuel & burn
    const cap = fuelCapacity(state);
    setWidth(els.fuelBar, state.fuel / cap);
    setText(els.fuelText, `${state.fuel.toFixed(1)} / ${cap}`);
    const burn = fuelBurnPer100(state);
    const m100 = 100 / cfg.world.pxPerMeter;
    setText(els.burnText, `${burn.toFixed(2)} / ${m100} m`);
    const moving = !isStationary(state);
    setText(els.burnSub,
      isCrawling(state) ? 'EMPTY — crawling'
        : moving ? `burning · ${state.train.cars.length} cars, weight ${trainWeight(state)}`
          : `idle · ${state.train.cars.length} cars, weight ${trainWeight(state)}`);
    els.burnSub.style.color = moving && !isCrawling(state) ? 'var(--fuel)' : isCrawling(state) ? 'var(--bad)' : '';

    // Engine
    const loco = state.train.cars.find((c) => c.type === 'locomotive');
    setWidth(els.engineBar, loco.hp / loco.maxHp);
    setText(els.engineText, `${Math.ceil(loco.hp)} / ${loco.maxHp} HP`);

    setText(els.scrapText, `${Math.floor(state.scrap)}`);
    const alive = aliveCrew(state).length;
    const outside = crewOutside(state).length;
    setText(els.crewText, `${alive} / ${state.crew.length}`);
    setText(els.crewSub, outside ? `${outside} outside` : 'all aboard');

    const remaining = Math.max(0, (state.level.exitX - state.train.head) / cfg.world.pxPerMeter);
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

    // Go button
    const running = state.train.running;
    els.go.classList.toggle('stop', running);
    const goLabel = running ? 'STOP' : 'GO';
    if (els.go.dataset.label !== goLabel) {
      els.go.dataset.label = goLabel;
      els.go.innerHTML = `${goLabel} <kbd>Space</kbd>`;
    }

    // Crew cards
    for (const card of els.crewCards.children) {
      const c = state.crew.find((m) => m.id === Number(card.dataset.id));
      card.classList.toggle('selected', ui.selectedCrew.has(c.id));
      card.classList.toggle('dead', !c.alive);
      card.disabled = !c.alive;
      setWidth(card.querySelector('.meter > i'), c.hp / c.maxHp);
      setText(card.querySelector('.status'), crewStatus(state, c));
    }

    // Warnings
    const warnings = [];
    if (outside && moving) warnings.push(['bad', `${outside} crew outside a moving train!`]);
    if (isCrawling(state)) warnings.push(['bad', 'Out of fuel']);
    else if (state.fuel / cap < 0.2) warnings.push(['caution', 'Low fuel']);
    if (loco.hp / loco.maxHp < 0.35) warnings.push(['bad', 'Locomotive badly damaged']);
    const rushers = state.enemies.filter((e) => e.type === 'rusher').length;
    if (rushers) warnings.push(['bad', `${rushers} rusher${rushers > 1 ? 's' : ''} incoming`]);
    if (f >= 0.7) warnings.push(['bad', 'Threat overwhelming — leave!']);
    const b = nextBarricade(state);
    if (b) {
      const meters = Math.round((b.x - state.train.head) / cfg.world.pxPerMeter);
      const front = cfg.cars[state.train.cars[0].type].label;
      if (state.train.blockedBy === b.id) {
        warnings.push(['bad', 'Blocked by barricade — too slow to ram. Clear it by hand.']);
      } else if (meters <= 80) {
        const dmg = ramDamage(state, b);
        warnings.push([dmg >= 40 ? 'bad' : 'caution', `Barricade in ${meters} m — ram: -${dmg} HP to ${front}`]);
      }
    }
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

    // Messages
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
    setText(els.detach.firstChild, canDetach ? `Detach ${cfg.cars[rear.type].label.replace(' car', '')} ` : 'Detach rear ');

    updateInfo(state, ui);
    els.paused.hidden = !ui.paused;
  }

  function updateInfo(state, ui) {
    const cfg = state.config;
    const car = state.train.cars.find((c) => c.id === ui.selectedCarId);
    if (car) {
      const def = cfg.cars[car.type];
      const idx = state.train.cars.indexOf(car);
      const pos = idx === 0 ? 'front' : idx === state.train.cars.length - 1 ? 'rear' : `position ${idx + 1}`;
      setText(els.infoTitle, `${def.label} — ${Math.ceil(car.hp)} / ${car.maxHp} HP${car.hp <= 0 ? ' (DISABLED)' : ''} · ${pos}`);
      let effect = '';
      if (car.type === 'ram') effect = idx === 0 ? ' ✔ Active (at front).' : ' ✘ Inactive — move it to the front.';
      setText(els.infoDesc, def.role + effect);
      els.repair.hidden = false;
      const canShunt = isStationary(state) && state.train.shunting === 0;
      els.toFront.hidden = false;
      els.toRear.hidden = false;
      els.toFront.disabled = !canShunt || idx === 0;
      els.toRear.disabled = !canShunt || idx === state.train.cars.length - 1;
      const r = cfg.repair;
      const can = isStationary(state) && car.hp < car.maxHp && state.scrap >= r.scrapCost;
      els.repair.disabled = !can;
      const why = !isStationary(state) ? ' (stop first)' : car.hp >= car.maxHp ? ' (full)' : state.scrap < r.scrapCost ? ' (need scrap)' : '';
      setText(els.repair, `Repair +${r.hpPerAction} HP for ${r.scrapCost} scrap${why}`);
      return;
    }
    els.repair.hidden = true;
    els.toFront.hidden = true;
    els.toRear.hidden = true;
    if (ui.selectedCrew.size) {
      setText(els.infoTitle, `${ui.selectedCrew.size} crew selected`);
      setText(els.infoDesc, 'Click ground to move · a deposit to gather · a wreck to salvage · a barricade to clear · a survivor to rescue · the train to board.');
    } else {
      setText(els.infoTitle, state.started ? 'Nothing selected' : 'Press Space (or GO) to depart');
      setText(els.infoDesc, 'Select crew with 1/2 or by clicking them. Click a car (or a chip on the left) to inspect, repair or move it.');
    }
  }

  return { update };
}
