// Work sites: things crew walk up to and work on.
//   node      – fuel / scrap deposit (gather)
//   wreck     – derelict or detached car (salvage → attached at the rear)
//   barricade – track obstruction (clear by hand → scrap)
//   survivor  – stranded person (rescue → joins the crew)

import { pushMessage, makeCrewMember, addEffect } from './state.js';
import { fuelCapacity, isStationary, trainTail } from './train.js';
import { attachCar } from './consist.js';

const COLLECTIONS = { node: 'nodes', wreck: 'wrecks', barricade: 'barricades', survivor: 'survivors' };

export function getSite(state, ref) {
  const list = state[COLLECTIONS[ref.kind]];
  return list ? list.find((s) => s.id === ref.id) : null;
}

export function siteActive(kind, site) {
  if (!site) return false;
  if (kind === 'node') return site.amount > 0;
  if (kind === 'wreck') return !site.done;
  if (kind === 'barricade') return !site.broken;
  if (kind === 'survivor') return !site.rescued;
  return false;
}

// Distance from the train's nearest end (0 if alongside it).
function distanceFromTrain(state, x) {
  const tail = trainTail(state);
  const head = state.train.head;
  return x < tail ? tail - x : x > head ? x - head : 0;
}

// Apply dt seconds of one crew member's work. Returns { working, blocked, done }.
export function workSite(state, c, kind, site, dt) {
  const cfg = state.config;
  if (kind === 'survivor') {
    rescue(state, site);
    return { working: false, blocked: null, done: true };
  }
  if (cfg.crew.pauseGatherWhenFighting && c.fighting) return { working: false, blocked: 'fighting', done: false };

  if (kind === 'node') return gather(state, site, dt);

  if (kind === 'wreck') {
    if (!isStationary(state) || distanceFromTrain(state, site.x) > cfg.salvage.maxAttachDistance) {
      return { working: false, blocked: 'needTrain', done: false };
    }
    site.work += dt;
    if (site.work >= site.workNeeded) {
      site.done = true;
      attachCar(state, site.carType, site.hp);
      state.stats.salvaged++;
      return { working: true, blocked: null, done: true };
    }
    return { working: true, blocked: null, done: false };
  }

  if (kind === 'barricade') {
    site.work += dt;
    if (site.work >= site.workNeeded) {
      site.broken = true;
      const scrap = Math.round(site.strength * cfg.barricade.scrapPerStrength);
      state.scrap += scrap;
      state.stats.scrapGathered += scrap;
      state.stats.barricadesCleared++;
      addEffect(state, { kind: 'burst', x: site.x, y: site.y, r: 40, color: '#ffb347', ttl: 0.5 });
      pushMessage(state, `Barricade cleared (+${scrap} scrap)`, 'good');
      return { working: true, blocked: null, done: true };
    }
    return { working: true, blocked: null, done: false };
  }
  return { working: false, blocked: null, done: true };
}

function gather(state, node, dt) {
  const cfg = state.config.crew;
  let take = Math.min(cfg.gatherRate * dt, node.amount);
  if (node.kind === 'fuel') {
    const space = fuelCapacity(state) - state.fuel;
    if (space <= 0) return { working: false, blocked: 'full', done: false };
    take = Math.min(take, space);
    state.fuel += take;
    state.stats.fuelGathered += take;
  } else {
    state.scrap += take;
    state.stats.scrapGathered += take;
  }
  node.amount -= take;
  if (node.amount <= 1e-6) {
    node.amount = 0;
    pushMessage(state, `${node.kind === 'fuel' ? 'Fuel' : 'Scrap'} deposit exhausted`, 'info');
    return { working: true, blocked: null, done: true };
  }
  return { working: true, blocked: null, done: false };
}

function rescue(state, survivor) {
  survivor.rescued = true;
  const member = makeCrewMember(state, survivor.name, survivor.x, survivor.y, state.config.survivor.hp, false);
  member.order = { type: 'board' };
  state.crew.push(member);
  state.stats.rescued++;
  pushMessage(state, `${survivor.name} joins the crew`, 'good');
}
