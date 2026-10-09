// Work sites: things units walk up to and work on.
//   node      – fuel / scrap deposit (dig into a load, haul it back to the train: see units.js)
//   wreck     – derelict or detached car (salvage → attached at the rear)
//   barricade – track obstruction (clear by hand → leaves a scrap pile)
//   survivor  – stranded person (rescue → joins the crew)
//   sentry    – your own deployed sentry gun (pack it back into a kit)

import { pushMessage, makeCrewMember, makeNode, addEffect } from './state.js';
import { isStationary, distanceToTrain } from './train.js';
import { attachCar } from './consist.js';

const COLLECTIONS = { node: 'nodes', wreck: 'wrecks', barricade: 'barricades', survivor: 'survivors', sentry: 'sentries' };

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
  if (kind === 'sentry') return site.hp > 0;
  return false;
}

export function siteRadius(kind, site) {
  return site.radius ?? 12;
}

// Apply dt seconds of one unit's work (already scaled by its work multiplier).
// Returns { working, blocked, done }. Deposits are handled by the haul loop in units.js.
export function workSite(state, u, kind, site, work) {
  const cfg = state.config;
  if (kind === 'survivor') {
    rescue(state, site);
    return { working: false, blocked: null, done: true };
  }
  if (kind === 'sentry') {
    site.pack = (site.pack ?? 0) + work;
    if (site.pack >= cfg.sentry.packTime) {
      site.hp = 0;
      site.packed = true;
      u.kit = true;
      pushMessage(state, 'Sentry packed up — bring the kit back to the train', 'info');
      return { working: true, blocked: null, done: true };
    }
    return { working: true, blocked: null, done: false };
  }
  if (cfg.crew.pauseGatherWhenFighting && u.fighting) return { working: false, blocked: 'fighting', done: false };

  if (kind === 'wreck') {
    if (!isStationary(state) || distanceToTrain(state, site.x, site.y) > cfg.salvage.maxAttachDistance) {
      return { working: false, blocked: 'needTrain', done: false };
    }
    site.work += work;
    if (site.work >= site.workNeeded) {
      site.done = true;
      attachCar(state, site.carType, site.hp, site.carState);
      state.stats.salvaged++;
      return { working: true, blocked: null, done: true };
    }
    return { working: true, blocked: null, done: false };
  }

  if (kind === 'barricade') {
    site.work += work;
    if (site.work >= site.workNeeded) {
      site.broken = true;
      const scrap = Math.round(site.strength * cfg.barricade.scrapPerStrength);
      makeNode(state, 'scrap', site.x - 30, site.y + 70, scrap);
      state.stats.barricadesCleared++;
      addEffect(state, { kind: 'burst', x: site.x, y: site.y, r: 40, color: '#ffb347', ttl: 0.5 });
      pushMessage(state, `Barricade cleared — left a ${scrap}-scrap pile`, 'good');
      return { working: true, blocked: null, done: true };
    }
    return { working: true, blocked: null, done: false };
  }
  return { working: false, blocked: null, done: true };
}

function rescue(state, survivor) {
  survivor.rescued = true;
  const member = makeCrewMember(state, survivor.name, survivor.x, survivor.y, state.config.survivor.hp, false);
  member.order = { type: 'board' };
  state.crew.push(member);
  state.stats.rescued++;
  pushMessage(state, `${survivor.name} joins the crew`, 'good');
}
