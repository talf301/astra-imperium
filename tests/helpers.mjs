// Bots and checks shared by the tests and by the app's development query parameters.
import { act, score, zones, newGame } from "../public/engine/game.mjs";
import { BASE_DECK, MONUMENTS, RES, LEADERS, SCENARIOS, MAPS } from "../public/engine/data.mjs";

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every setup option, cycled by seed.
export function setupFor(seed) {
  const leaders = [null, ...Object.keys(LEADERS)];
  const scen = [null, ...Object.keys(SCENARIOS)];
  const tiles = {};
  MONUMENTS.forEach((k, i) => { tiles[k] = Math.floor(seed / 3 ** i) % 3; });
  return {
    map: Object.keys(MAPS)[seed % 3],
    leader: leaders[seed % leaders.length],
    scenario: scen[Math.floor(seed / 7) % scen.length],
    tiles: seed % 4 === 0 ? undefined : tiles,
    difficulty: seed % 3,
  };
}

export function randomAnswer(state, r) {
  const a = state.ask;
  if (a.kind === "order") {
    const ids = a.options.map((o) => o.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }
  return a.options[Math.floor(r() * a.options.length)].id;
}
export const step = (state, r) => act(state, randomAnswer(state, r));

// A rough value of a position: the score now plus a little for resources and progress.
function value(state) {
  if (state.over && state.over.lost) return -100;
  const s = score(state).total;
  const res = RES.reduce((a, k) => a + Math.min(state.res[k], 6), 0);
  const cubes = MONUMENTS.reduce((a, k) => a + state.mon[k], 0);
  let v = s + 0.3 * res + 1.3 * cubes + 0.8 * state.built.length + 0.7 * (state.locs.length - 1) + 2 * state.cubes;
  if (!state.over) {
    // Be ready for the coming invasion: enough Military, or locations to give up.
    const inv = [0, 2, 3, 5][state.round];
    const safe = (state.mon.mars === 2 && state.setup.tiles.mars === 0) || state.res.M >= inv;
    if (!safe) v -= state.locs.length - 1 >= [0, 1, 1, 2][state.round] ? 1.5 : 8;
  }
  return v;
}

// Greedy: try every answer, follow each to the end of the turn greedily, keep the best.
export function greedyAnswer(state, r, depth = 0) {
  const a = state.ask;
  if (a.kind === "order") return randomAnswer(state, r);
  let best = null, bestV = -1e9;
  for (const o of a.options) {
    let s;
    try { s = act(state, o.id); } catch (e) { continue; }
    let n = 0;
    while (s.ask && s.turn === state.turn && s.round === state.round && n++ < 8 && depth < 3) s = act(s, greedyAnswer(s, r, depth + 1));
    const v = value(s) + r() * 0.01;
    if (v > bestV) { bestV = v; best = o.id; }
  }
  return best;
}
export const greedyStep = (state, r) => act(state, greedyAnswer(state, r));

export function checkInvariants(state) {
  const all = zones(state).slice().sort();
  const want = [...BASE_DECK, ...(state.setup.leader === "kallax" ? ["edict"] : [])].sort();
  if (all.join() !== want.join()) throw new Error("cards lost or duplicated: " + all.join());
  for (const k of RES) if (!(state.res[k] >= 0 && state.res[k] <= 9)) throw new Error("resource out of range");
  for (const k of MONUMENTS) if (!(state.mon[k] >= 0 && state.mon[k] <= 2)) throw new Error("monument cubes out of range");
  if (new Set(state.locs).size !== state.locs.length || state.locs.length > 7) throw new Error("bad locations");
  if (!state.over && !state.locs.includes(0)) throw new Error("Rome lost without the game ending");
  if (!state.over && (!state.ask || !state.ask.options.length)) throw new Error("no decision and not over");
  if (state.round < 1 || state.round > 3) throw new Error("bad round");
}

export function playOut(setup, seed, stepFn = step, limit = 400) {
  const r = rng(seed * 7919 + 1);
  let s = newGame(setup, seed);
  checkInvariants(s);
  let n = 0;
  while (!s.over) {
    if (++n > limit) throw new Error("game did not end");
    s = stepFn(s, r);
    checkInvariants(s);
  }
  return s;
}
