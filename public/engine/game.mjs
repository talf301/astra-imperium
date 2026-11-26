// Astra Imperium rules engine. Plain-JSON state, seeded randomness, no interface code.
//
// The game is a queue of steps. advance() runs steps until one needs the player; that step leaves
// a decision in state.ask ({kind, text, options:[{id, ...}]}). act(state, optionId) answers it and
// returns the next state. The interface only ever shows state.ask and calls act().

import { CARDS, BASE_DECK, STRUCTURES, MONUMENTS, MON_NAME, VAULT_ADJACENT, MAPS, INVASIONS, LEADERS, RANKS, SCENARIOS, RES, RES_NAME, MAX_RES } from "./data.mjs";

export const STATE_VERSION = 1;
const clone = (x) => JSON.parse(JSON.stringify(x));
const zero = () => ({ S: 0, I: 0, M: 0 });
const key = (v) => `${v.S},${v.I},${v.M}`;
const sum = (v) => v.S + v.I + v.M;
const add = (a, b) => ({ S: a.S + b.S, I: a.I + b.I, M: a.M + b.M });
export const resText = (v) => RES.filter((r) => v[r]).map((r) => `${v[r]} ${RES_NAME[r]}`).join(" + ") || "nothing";

function rnd(state) {
  let t = (state.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(state, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- queries ----------

const rule = (state) => (state.setup.scenario ? SCENARIOS[state.setup.scenario].rule : "none");
const leader = (state) => state.setup.leader;
const tile = (state, k) => state.setup.tiles[k];
const complete = (state, k) => state.mon[k] === 2;

// The two resources Novastage makes interchangeable, or null.
function convPair(state) {
  if (!complete(state, "nova")) return null;
  return tile(state, "nova") === 0 ? ["S", "M"] : tile(state, "nova") === 2 ? ["S", "I"] : null;
}
function bonuses(state) {
  const b = {};
  for (const id of state.built) if (CARDS[id].bonus) b[CARDS[id].bonus] = 2;
  return b;
}
export function conquestCost(state) {
  return state.locs.length + (leader(state) === "starjan" ? 2 : 0);
}

// Every distinct way to pay a cost with the given resources.
// cost: {fixed: vec} | {any: n} | {oneType: n} | {alts: [cost, ...]}
export function payOptions(state, cost, res = state.res) {
  const out = new Map();
  const push = (v) => { if (RES.every((r) => v[r] <= res[r])) out.set(key(v), v); };
  if (cost.alts) {
    for (const c of cost.alts) for (const v of payOptions(state, c, res)) out.set(key(v), v);
  } else if (cost.fixed) {
    const pair = convPair(state);
    if (!pair) push({ ...zero(), ...cost.fixed });
    else {
      const [a, c] = pair;
      const t = (cost.fixed[a] || 0) + (cost.fixed[c] || 0);
      for (let x = 0; x <= t; x++) push({ ...zero(), ...cost.fixed, [a]: x, [c]: t - x });
    }
  } else if (cost.any != null) {
    for (let s = 0; s <= cost.any; s++) for (let i = 0; s + i <= cost.any; i++) push({ S: s, I: i, M: cost.any - s - i });
  } else if (cost.oneType != null) {
    for (const r of RES) push({ ...zero(), [r]: cost.oneType });
  }
  return [...out.values()];
}
export const canPay = (state, cost, res = state.res) => payOptions(state, cost, res).length > 0;

// Every distinct result of gaining one of the given bundles: the amounts actually gained, before the cap of 9.
// Structure bonuses add 2 to each type actually gained; Novastage lets either of its two resources be taken as the other.
export function gainOptions(state, bundles) {
  const bon = bonuses(state);
  const pair = convPair(state);
  const out = new Map();
  const push = (v) => {
    const capped = {};
    for (const r of RES) capped[r] = Math.min(MAX_RES, state.res[r] + v[r]);
    if (!out.has(key(capped))) out.set(key(capped), v);
  };
  for (const b0 of bundles) {
    const b = { ...zero(), ...b0 };
    if (!pair) {
      const v = { ...b };
      for (const r of RES) if (v[r] > 0 && bon[r]) v[r] += 2;
      push(v);
      continue;
    }
    const [a, c] = pair;
    const third = RES.find((r) => r !== a && r !== c);
    const t = b[a] + b[c];
    const v3 = b[third] + (b[third] > 0 && bon[third] ? 2 : 0);
    for (let x = 0; x <= t; x++) {
      const ba = x > 0 && bon[a] ? 2 : 0;
      const bc = t - x > 0 && bon[c] ? 2 : 0;
      for (let ja = 0; ja <= ba; ja++) for (let jc = 0; jc <= bc; jc++) {
        push({ [a]: x + ba - ja + jc, [c]: t - x + bc - jc + ja, [third]: v3 });
      }
    }
  }
  return [...out.values()];
}

function actionCost(state, id) {
  const c = CARDS[id];
  if (c.kind === "conq") return { fixed: { M: conquestCost(state) } };
  return { fixed: c.cost };
}

// Can this card's Action be taken? Returns "" when legal, otherwise the reason.
export function whyNot(state, id, res = state.res, viaEdict = false) {
  const c = CARDS[id];
  if (c.kind === "trib") return "";
  if (c.kind === "mon") {
    if (complete(state, c.mon)) return `${MON_NAME[c.mon]} is already complete.`;
    return canPay(state, actionCost(state, id), res) ? "" : "You cannot pay the cost.";
  }
  if (c.kind === "str") {
    if (leader(state) === "commodorus") return "Plague: you cannot build structures.";
    return canPay(state, actionCost(state, id), res) ? "" : "You cannot pay the cost.";
  }
  if (c.kind === "conq") {
    if (state.locs.length >= 7) return "You control every location.";
    return canPay(state, actionCost(state, id), res) ? "" : `You cannot pay ${conquestCost(state)} Military.`;
  }
  if (c.kind === "edict") {
    if (viaEdict) return "The Edict cannot copy itself.";
    if (!canPay(state, { fixed: c.cost }, res)) return "You cannot pay 1 Military.";
    return edictTargets(state).length ? "" : "No card in the discard pile has an Action you can take.";
  }
  return "?";
}
function edictPays(state, target) {
  return payOptions(state, { fixed: CARDS.edict.cost }).filter((p) => {
    const left = { S: state.res.S - p.S, I: state.res.I - p.I, M: state.res.M - p.M };
    return whyNot(state, target, left, true) === "";
  });
}
export function edictTargets(state) {
  const seen = new Set();
  return state.discard.filter((t) => {
    if (seen.has(t) || CARDS[t].kind === "edict") return false;
    seen.add(t);
    return edictPays(state, t).length > 0;
  });
}

// ---------- scoring ----------

export function tileVP(state, k) {
  const t = tile(state, k);
  const n = state.built.length;
  const cubes = MONUMENTS.reduce((a, m) => a + state.mon[m], 0);
  switch (k) {
    case "nova": return [2, 0, 3][t];
    case "urbis": return [n, 5 - n, 1 + state.built.reduce((a, id) => a + (CARDS[id].vp || 0), 0)][t];
    case "qb": return [Math.min(...RES.map((r) => state.res[r])), Math.max(...RES.map((r) => Math.floor(state.res[r] / 3))), 3 * RES.filter((r) => state.res[r] === 0).length][t];
    case "vault": return [4, 2 * Math.floor(cubes / 3), 2 * VAULT_ADJACENT.filter((m) => complete(state, m)).length][t];
    case "flux": return [state.locs.length, state.locs.length === 1 ? 4 : 0, 3][t];
    case "mars": return [2, 3, 1][t];
  }
  return 0;
}

export function score(state) {
  const lines = [];
  const r = rule(state);
  const n = state.locs.length;
  lines.push([`${n} location${n === 1 ? "" : "s"}${r === "lastBastion" ? " (2 VP each)" : ""}`, n * (r === "lastBastion" ? 2 : 1)]);
  if (leader(state) === "starjan") lines.push(["Expansionism (Starjan)", n]);
  for (const id of state.built) if (CARDS[id].vp) lines.push([CARDS[id].name, CARDS[id].vp]);
  for (const k of MONUMENTS) {
    if (complete(state, k)) {
      let vp = tileVP(state, k);
      const notes = [];
      if (leader(state) === "voidspasian") { vp += 1; notes.push("+1 Voidspasian"); }
      if (r === "monPlus2") { vp += 2; notes.push("+2 scenario"); }
      if (r === "decay") { vp -= 2; notes.push("-2 Decay"); }
      lines.push([MON_NAME[k] + (notes.length ? ` (${notes.join(", ")})` : ""), vp]);
    } else if (state.mon[k] === 1 && leader(state) === "calculigula") lines.push([`${MON_NAME[k]}, 1 cube (Calculigula)`, 2]);
  }
  if (r === "patricians" && state.cubes) lines.push([`${state.cubes} cube${state.cubes === 1 ? "" : "s"} on the scenario card`, state.cubes]);
  if (r === "repel" && state.repelled) lines.push([`${state.repelled} invasion${state.repelled === 1 ? "" : "s"} repelled${state.repelled === 3 ? " (+1 for all)" : ""}`, state.repelled + (state.repelled === 3 ? 1 : 0)]);
  if (r === "circus") {
    if (state.cubes === 0) lines.push(["No circus games", -2]);
    else if (state.cubes >= 2) lines.push(["Circus games", 2]);
  }
  if (leader(state) === "kallax") lines.push(["Cruel Leader (Kallax Calla)", -2]);
  return { lines, total: lines.reduce((a, l) => a + l[1], 0) };
}

export const rankFor = (vp) => RANKS.find(([min]) => vp >= min)[1];

// Outcome of a finished game: {lost, reason, total, lines, rank} and, in a scenario, {goal, won}.
export function result(state) {
  if (!state.over) return null;
  const sc = score(state);
  const out = { lost: !!state.over.lost, reason: state.over.reason || "", total: sc.total, lines: sc.lines };
  if (state.setup.scenario) {
    out.goal = SCENARIOS[state.setup.scenario].goals[state.setup.difficulty];
    out.won = !out.lost && out.total >= out.goal;
  } else if (!out.lost) out.rank = rankFor(out.total);
  return out;
}

// ---------- setup ----------

export function randomTiles(seed) {
  const s = { rng: seed >>> 0 };
  const tiles = {};
  for (const k of MONUMENTS) tiles[k] = Math.floor(rnd(s) * 3);
  return tiles;
}

export function newGame(setup = {}, seed = 1) {
  const tiles = {};
  for (const k of MONUMENTS) tiles[k] = (setup.tiles && setup.tiles[k]) || 0;
  const state = {
    v: STATE_VERSION,
    setup: { map: setup.map || "earth", leader: setup.leader || null, tiles, scenario: setup.scenario || null, difficulty: setup.difficulty ?? 1 },
    seed, rng: seed >>> 0,
    round: 1, turn: 0,
    res: { S: 1, I: 1, M: 1 },
    deck: [], discard: [], hand: [], faceDown: null, built: [], removed: [],
    locs: [0], mon: {}, cubes: 0, repelled: 0,
    played: null, hid: 0,
    queue: [], ask: null, askStep: null, over: null, log: [],
  };
  for (const k of MONUMENTS) state.mon[k] = 0;
  if (!MAPS[state.setup.map]) throw new Error("unknown map");
  if (state.setup.leader && !LEADERS[state.setup.leader]) throw new Error("unknown leader");
  if (state.setup.scenario && !SCENARIOS[state.setup.scenario]) throw new Error("unknown scenario");
  const r = rule(state);
  const L = leader(state);

  let deck = [...BASE_DECK];
  if (L === "kallax") deck.push("edict");
  shuffle(state, deck);
  if (r === "poverty") {
    state.removed.push(...deck.splice(0, 2));
    say(state, `Poverty: ${state.removed.map((id) => CARDS[id].name).join(" and ")} return to the box.`);
  }
  if (r === "mining") {
    deck = deck.filter((id) => id !== "mining");
    state.built.push("mining");
  }
  if (L === "commodorus") {
    state.discard.push(...deck.filter((id) => CARDS[id].kind === "str"));
    deck = deck.filter((id) => CARDS[id].kind !== "str");
  }
  state.deck = deck;
  // A scenario's special rule takes precedence over a conflicting leader effect (rulebook, Leaders Module).
  if (r === "extraRes") for (const x of RES) state.res[x] += 1;
  else if (L === "voidspasian") state.res = zero();

  if (r === "freeMonument") state.queue.push({ t: "pickMonument" });
  if (r === "crisis") for (let i = 0; i < 3; i++) state.queue.push({ t: "pickLocation", reason: "setup" });
  if (r === "sortDeck") state.queue.push({ t: "sortDeck" });
  state.queue.push({ t: "turn" });
  return advance(state);
}

// ---------- step machine ----------

function say(state, text) {
  state.log.push(text);
  if (state.log.length > 60) state.log.shift();
}
const front = (state, ...steps) => state.queue.unshift(...steps);
function lose(state, reason) {
  state.over = { lost: true, reason };
  state.queue = [];
  say(state, reason);
}
function applyGain(state, v) {
  for (const r of RES) state.res[r] = Math.min(MAX_RES, state.res[r] + v[r]);
}
function applyPay(state, v) {
  for (const r of RES) {
    state.res[r] -= v[r];
    if (state.res[r] < 0) throw new Error("negative resource");
  }
}
const freeLocs = (state) => [1, 2, 3, 4, 5, 6].filter((i) => !state.locs.includes(i));

function actionSteps(state, id, viaEdict) {
  const c = CARDS[id];
  if (c.kind === "mon") return [{ t: "pay", cost: actionCost(state, id), why: c.name }, { t: "addCube", mon: c.mon }];
  if (c.kind === "str") return [{ t: "pay", cost: actionCost(state, id), why: c.name }, { t: "build", card: id, viaEdict }];
  if (c.kind === "conq") return [{ t: "pay", cost: actionCost(state, id), why: "Conquest" }, { t: "pickLocation", reason: "conquer" }];
  if (c.kind === "trib") {
    const steps = [{ t: "gain", bundles: [{ ...zero(), [c.trib]: state.locs.length }], why: "Call for Tribute" }];
    if (rule(state) === "corruption" && !viaEdict) steps.push({ t: "corruption" });
    return steps;
  }
  throw new Error("no action for " + id);
}

// Steps that run on their own. Each may set state.ask to wait for the player.
const RUN = {
  pickMonument(state, step) {
    state.ask = { kind: "monument", text: "Choose a monument to start the game completed.", options: MONUMENTS.map((k) => ({ id: k, mon: k })) };
  },
  pickLocation(state, step) {
    const free = freeLocs(state);
    if (!free.length) return;
    const text = { setup: "Choose a location to control at the start.", conquer: "Choose a location to conquer.", free: "RSS Mars 1: choose a location to conquer for free." }[step.reason];
    state.ask = { kind: "location", text, options: free.map((i) => ({ id: "loc" + i, loc: i })) };
  },
  sortDeck(state) {
    state.ask = { kind: "order", text: "Sort the deck into the order of your choice. The first card you pick is drawn first.", options: [...state.deck].sort().map((id) => ({ id, card: id })) };
  },
  turn(state) {
    state.turn++;
    state.played = null;
    const steps = [];
    if (leader(state) === "commodorus" && state.deck.length) {
      for (const r of RES) if (state.res[r] === 0) steps.push({ t: "gain", bundles: [{ ...zero(), [r]: 1 }], why: "Hercules" });
    }
    front(state, ...steps, { t: "draw" });
  },
  draw(state) {
    if (!state.deck.length) return front(state, { t: "endRound" });
    state.hand = state.deck.splice(0, 3);
    state.hid++;
    state.faceDown = leader(state) === "cyberius" && state.hand.length === 3 ? state.hand[2] : null;
    front(state, { t: "play" });
  },
  play(state) {
    const options = [];
    for (const id of state.hand) {
      if (id === state.faceDown) continue;
      const c = CARDS[id];
      options.push({ id: "gain:" + id, type: "gain", card: id });
      if (c.kind === "edict") {
        if (canPay(state, { fixed: c.cost })) for (const t of edictTargets(state)) options.push({ id: `edict:${id}:${t}`, type: "edict", card: id, target: t });
      } else if (whyNot(state, id) === "") options.push({ id: "act:" + id, type: "act", card: id });
      if (rule(state) === "circus" && c.mon === "mars" && canPay(state, { any: 3 })) options.push({ id: "alt:" + id, type: "alt", card: id });
    }
    if (state.faceDown) for (const r of RES) if (state.res[r] > 0) options.push({ id: "flip:" + r, type: "flip", res: r });
    state.ask = { kind: "play", text: "Play one card for its Resources or its Action.", options };
  },
  alsoGain(state, step) {
    const others = state.hand.filter((id) => id !== step.card && id !== state.faceDown);
    if (!others.length) return front(state, { t: "treason", card: step.card, also: null });
    state.ask = { kind: "also", text: "Novastage: also gain the Resources from another card in your hand.", options: others.map((id) => ({ id, card: id })) };
  },
  treason(state, step) {
    if (leader(state) !== "cyberius") return front(state, { t: "cardGain", card: step.card, also: step.also, plus: null });
    const types = RES.filter((r) => CARDS[step.card].gain[r] > 0);
    state.ask = {
      kind: "treason", text: `Treason Trials: remove ${CARDS[step.card].name} from the game to gain +1 of its resources?`,
      options: [{ id: "keep" }, ...types.map((r) => ({ id: "rm:" + r, res: r }))],
    };
  },
  cardGain(state, step) {
    let b = { ...CARDS[step.card].gain };
    if (step.also) b = add(b, CARDS[step.also].gain);
    if (step.plus) b[step.plus] += 1;
    front(state, { t: "gain", bundles: [b], why: CARDS[step.card].name });
  },
  gain(state, step) {
    const opts = gainOptions(state, step.bundles);
    if (opts.length === 1) return doGain(state, opts[0], step.why);
    state.ask = { kind: "gainAs", text: `${step.why}: choose what to gain.`, options: opts.map((v) => ({ id: key(v), gain: v })) };
  },
  pay(state, step) {
    let opts = payOptions(state, step.cost);
    if (step.thenCard) opts = edictPays(state, step.thenCard);
    if (!opts.length) throw new Error("cannot pay " + JSON.stringify(step.cost));
    if (opts.length === 1) return doPay(state, opts[0], step.why);
    state.ask = { kind: "pay", text: `${step.why}: choose how to pay.`, options: opts.map((v) => ({ id: key(v), pay: v })) };
  },
  addCube(state, step) {
    state.mon[step.mon]++;
    say(state, complete(state, step.mon) ? `${MON_NAME[step.mon]} is complete.` : `Cube added to ${MON_NAME[step.mon]}.`);
  },
  cube(state) {
    state.cubes++;
    say(state, `Cube added to the scenario card (${state.cubes}).`);
  },
  build(state, step) {
    state.built.push(step.card);
    const from = step.viaEdict ? state.discard : state.hand;
    from.splice(from.indexOf(step.card), 1);
    say(state, `Built ${CARDS[step.card].name}.`);
    if (rule(state) === "patricians" && canPay(state, { fixed: { I: 2 } })) front(state, { t: "patricians" });
  },
  patricians(state) {
    state.ask = { kind: "yesno", text: "Pay 2 Industry to add a cube to the scenario card (1 VP)?", options: [{ id: "yes" }, { id: "no" }] };
  },
  corruption(state) {
    const pays = payOptions(state, { alts: [{ fixed: { S: 2 } }, { fixed: { M: 1 } }] });
    if (!pays.length) return;
    state.ask = { kind: "bribe", text: "Corruption: pay 2 Science or 1 Military to add a cube to the scenario card?", options: [...pays.map((v) => ({ id: key(v), pay: v })), { id: "no" }] };
  },
  endTurn(state) {
    state.discard.push(...state.hand);
    state.hand = [];
    state.faceDown = null;
    front(state, { t: "turn" });
  },
  endRound(state) {
    const steps = [];
    const n = rule(state) === "crisis" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (rule(state) === "inflation") steps.push({ t: "inflation" });
      steps.push({ t: "invasion", i });
    }
    if (leader(state) === "calculigula" && state.round < 3) steps.push({ t: "waste" });
    steps.push({ t: "nextRound" });
    front(state, ...steps);
  },
  inflation(state) {
    const n = 2 * state.built.length;
    if (!n) return;
    if (!canPay(state, { any: n })) return lose(state, `Inflation: you cannot pay ${n} resources for your structures.`);
    front(state, { t: "pay", cost: { any: n }, why: `Inflation (${n} resources)` });
  },
  invasion(state, step) {
    if (rule(state) === "plunder") front(state, { t: "plunder" }, { t: "invade", i: step.i });
    else front(state, { t: "invade", i: step.i });
  },
  plunder(state) {
    const opts = MONUMENTS.filter((k) => state.mon[k] > 0);
    if (!opts.length) return lose(state, "Plunder of the Capital: you have no monument cube to remove.");
    state.ask = { kind: "unbuild", text: "Plunder: remove a cube from a monument.", options: opts.map((k) => ({ id: k, mon: k })) };
  },
  invade(state, step) {
    const inv = INVASIONS[state.round];
    if (complete(state, "mars") && tile(state, "mars") === 0 && !(rule(state) === "crisis" && step.i === 1)) {
      say(state, `RSS Mars 1: the Act ${"I".repeat(state.round)} invasion is ignored.`);
      return;
    }
    const cost = { alts: [{ fixed: { M: inv.cost } }] };
    if (complete(state, "mars") && tile(state, "mars") === 1) cost.alts.push({ oneType: inv.cost });
    const pays = payOptions(state, cost);
    state.ask = {
      kind: "invasion", act: state.round, cost: inv.cost, lose: inv.lose,
      text: `Invasion, Act ${"I".repeat(state.round)}: pay ${inv.cost} Military or lose ${inv.lose} location${inv.lose > 1 ? "s" : ""}.`,
      options: [...pays.map((v) => ({ id: key(v), pay: v })), { id: "lose" }],
    };
  },
  loseLocation(state) {
    if (rule(state) === "lastBastion") return lose(state, "You lost a location: the last bastion has fallen.");
    const mine = state.locs.filter((i) => i !== 0);
    if (!mine.length) return lose(state, "Rome has fallen to the invaders.");
    if (mine.length === 1) return dropLoc(state, mine[0]);
    state.ask = { kind: "loseLocation", text: "Choose a location to lose.", options: mine.map((i) => ({ id: "loc" + i, loc: i })) };
  },
  afterInvasion(state) {
    if (complete(state, "mars") && tile(state, "mars") === 2) front(state, { t: "pickLocation", reason: "free" });
  },
  waste(state) {
    state.ask = {
      kind: "waste", text: "Wasted Resources: choose 2 resource types to set to 0.",
      options: RES.map((r) => ({ id: "keep" + r, keep: r })),
    };
  },
  nextRound(state) {
    if (state.round === 3) {
      if (rule(state) === "corruption" && state.cubes < 3) return lose(state, `Corruption: only ${state.cubes} of 3 cubes on the scenario card.`);
      state.over = { lost: false };
      say(state, "The third invasion is resolved. The game ends.");
      return;
    }
    state.round++;
    state.deck = shuffle(state, state.discard);
    state.hid++;
    state.discard = [];
    say(state, `Act ${"I".repeat(state.round)} begins.`);
    front(state, { t: "turn" });
  },
};

function doGain(state, v, why) {
  const before = { ...state.res };
  applyGain(state, v);
  const got = {};
  for (const r of RES) got[r] = state.res[r] - before[r];
  say(state, `${why}: gain ${resText(v)}${sum(got) < sum(v) ? " (capped at 9)" : ""}.`);
}
function doPay(state, v, why) {
  applyPay(state, v);
  if (sum(v)) say(state, `${why}: pay ${resText(v)}.`);
}
function dropLoc(state, i) {
  state.locs.splice(state.locs.indexOf(i), 1);
  say(state, "You lose control of a location.");
}
const pick = (state, id) => {
  const o = state.ask.options.find((x) => x.id === id);
  if (!o) throw new Error(`illegal answer ${JSON.stringify(id)} to ${state.ask.kind}`);
  return o;
};

// Applying the player's answer to the step that asked.
const ANSWER = {
  pickMonument(state, step, o) {
    state.mon[o.mon] = 2;
    say(state, `${MON_NAME[o.mon]} starts completed.`);
  },
  pickLocation(state, step, o) {
    state.locs.push(o.loc);
    if (step.reason === "setup") return;
    const r = MAPS[state.setup.map].locs[o.loc - 1][0];
    say(state, "You conquer a location.");
    if (complete(state, "flux") && tile(state, "flux") === 2) {
      const bundles = [];
      for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) bundles.push(add({ ...zero(), [RES[a]]: 1 }, { ...zero(), [RES[b]]: 1 }));
      front(state, { t: "gain", bundles, why: "Orbital Fluxway" });
    } else front(state, { t: "gain", bundles: [{ ...zero(), [r]: 1 }], why: "Location" });
  },
  sortDeck(state, step, order) {
    if (!Array.isArray(order) || [...order].sort().join() !== [...state.deck].sort().join()) throw new Error("illegal deck order");
    state.deck = [...order];
    say(state, "You sort the deck.");
  },
  play(state, step, o) {
    if (o.type === "flip") {
      state.res[o.res]--;
      say(state, `From Capri: pay 1 ${RES_NAME[o.res]} to flip ${CARDS[state.faceDown].name}.`);
      state.faceDown = null;
      state.hid++;
      return front(state, { t: "play" });
    }
    state.played = o.card;
    const c = CARDS[o.card];
    if (o.type === "gain") {
      const first = complete(state, "nova") && tile(state, "nova") === 1 ? { t: "alsoGain", card: o.card } : { t: "treason", card: o.card, also: null };
      return front(state, first, { t: "endTurn" });
    }
    if (o.type === "act") {
      say(state, `You play ${c.name} for its Action.`);
      return front(state, ...actionSteps(state, o.card, false), { t: "endTurn" });
    }
    if (o.type === "alt") {
      say(state, `You play ${c.name} to hold circus games.`);
      return front(state, { t: "pay", cost: { any: 3 }, why: "Circus games" }, { t: "cube" }, { t: "endTurn" });
    }
    if (o.type === "edict") {
      say(state, `Edict of Kallax Calla copies ${CARDS[o.target].name}.`);
      return front(state, { t: "pay", cost: { fixed: c.cost }, thenCard: o.target, why: "Edict" }, { t: "copy", target: o.target }, { t: "endTurn" });
    }
  },
  alsoGain(state, step, o) {
    front(state, { t: "treason", card: step.card, also: o.card });
  },
  treason(state, step, o) {
    if (o.id !== "keep") {
      state.removed.push(step.card);
      state.hand.splice(state.hand.indexOf(step.card), 1);
      say(state, `Treason Trials: ${CARDS[step.card].name} is removed from the game.`);
    }
    front(state, { t: "cardGain", card: step.card, also: step.also, plus: o.res || null });
  },
  gain(state, step, o) { doGain(state, o.gain, step.why); },
  pay(state, step, o) { doPay(state, o.pay, step.why); },
  patricians(state, step, o) {
    if (o.id === "yes") front(state, { t: "pay", cost: { fixed: { I: 2 } }, why: "Scenario cube" }, { t: "cube" });
  },
  corruption(state, step, o) {
    if (o.id === "no") return;
    doPay(state, o.pay, "Corruption");
    RUN.cube(state);
  },
  plunder(state, step, o) {
    state.mon[o.mon]--;
    say(state, `Plunder: a cube is removed from ${MON_NAME[o.mon]}.`);
  },
  invade(state, step, o) {
    const inv = INVASIONS[state.round];
    if (o.id === "lose") {
      say(state, "The invaders take territory.");
      front(state, ...Array.from({ length: inv.lose }, () => ({ t: "loseLocation" })), { t: "afterInvasion" });
    } else {
      // I.III Emperor counts only a payment of the Military cost, not RSS Mars 1 variant I's other resources.
      const military = payOptions(state, { fixed: { M: inv.cost } }).some((v) => key(v) === key(o.pay));
      doPay(state, o.pay, "Invasion repelled");
      if (rule(state) === "repel" && military) state.repelled++;
      front(state, { t: "afterInvasion" });
    }
  },
  loseLocation(state, step, o) { dropLoc(state, o.loc); },
  waste(state, step, o) {
    for (const r of RES) if (r !== o.keep) state.res[r] = 0;
    say(state, `Wasted Resources: only ${RES_NAME[o.keep]} is kept.`);
  },
};
RUN.copy = (state, step) => front(state, ...actionSteps(state, step.target, true));

function advance(state) {
  let guard = 0;
  while (!state.ask && !state.over) {
    if (++guard > 500) throw new Error("engine loop");
    const step = state.queue.shift();
    if (!step) throw new Error("empty queue");
    RUN[step.t](state, step);
    if (state.ask) state.askStep = step;
  }
  if (state.over) { state.ask = null; state.askStep = null; }
  return state;
}

// Answer the current decision. `answer` is an option id (or, for kind "order", the full list of card ids).
export function act(prev, answer) {
  if (!prev.ask) throw new Error("no decision pending");
  const state = clone(prev);
  const step = state.askStep;
  const o = state.ask.kind === "order" ? answer : pick(state, answer);
  state.ask = null;
  state.askStep = null;
  ANSWER[step.t](state, step, o);
  return advance(state);
}

// Where every card is, for tests: each card must be in exactly one zone.
export function zones(state) {
  return [...state.deck, ...state.discard, ...state.hand, ...state.built, ...state.removed];
}

// For tests and tools: change fields of a state by hand, then ask the current decision again.
export function reask(prev, patch = {}) {
  const state = clone({ ...prev, ...patch });
  if (state.askStep) state.queue.unshift(state.askStep);
  state.ask = null;
  state.askStep = null;
  return advance(state);
}
