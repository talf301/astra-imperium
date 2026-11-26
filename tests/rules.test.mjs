// Rules cases: a state built by hand, exact numbers asserted. One per rule and per card ability.
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, act, reask, score, result, gainOptions, payOptions, conquestCost, whyNot, tileVP } from "../public/engine/game.mjs";
import { CARDS, BASE_DECK, SCENARIOS } from "../public/engine/data.mjs";

const R = (S, I, M) => ({ S, I, M });
// A game at its first "play" decision with the given hand and patches. The rest of the cards go to the deck.
function at(setup, hand, patch = {}) {
  let s = newGame(setup, 11);
  while (s.ask.kind !== "play") s = act(s, s.ask.kind === "order" ? s.ask.options.map((o) => o.id) : s.ask.options[0].id);
  const used = new Set([...hand, ...(patch.built || s.built), ...(patch.discard || []), ...(patch.removed || s.removed)]);
  const all = [...BASE_DECK, ...(setup.leader === "kallax" ? ["edict"] : [])];
  const deck = patch.deck || all.filter((id) => !used.has(id));
  return reask(s, { hand, deck, discard: [], faceDown: null, ...patch });
}
const ids = (s) => s.ask.options.map((o) => o.id);
// Answer decisions with the first option until the predicate holds.
function until(s, pred) {
  let n = 0;
  while (!s.over && !pred(s)) { s = act(s, s.ask.options[0].id); if (++n > 300) throw new Error("until: no stop"); }
  return s;
}
// Play gain-only turns until the invasion decision of the current round.
function toInvasion(s) {
  return until(s, (x) => x.ask.kind === "invasion");
}

test("components: 21 base cards, 12 monument, 5 structure, 2 conquest, 2 tribute", () => {
  assert.equal(BASE_DECK.length, 21);
  const kinds = {};
  for (const id of BASE_DECK) kinds[CARDS[id].kind] = (kinds[CARDS[id].kind] || 0) + 1;
  assert.deepEqual(kinds, { mon: 12, str: 5, conq: 2, trib: 2 });
  const perMon = {};
  for (const id of BASE_DECK) if (CARDS[id].mon) perMon[CARDS[id].mon] = (perMon[CARDS[id].mon] || 0) + 1;
  assert.deepEqual(Object.values(perMon), [2, 2, 2, 2, 2, 2]);
  assert.equal(Object.keys(SCENARIOS).filter((k) => k[0] === "1").length, 9);
  assert.equal(Object.keys(SCENARIOS).filter((k) => k[0] === "2").length, 7);
});

test("setup: 1 of each resource, Rome controlled, draw 3", () => {
  const s = newGame({}, 1);
  assert.deepEqual(s.res, R(1, 1, 1));
  assert.deepEqual(s.locs, [0]);
  assert.equal(s.hand.length, 3);
  assert.equal(s.deck.length, 18);
  assert.equal(s.ask.kind, "play");
});

test("play for resources: gain the printed resources, discard all three cards", () => {
  let s = at({}, ["lab", "nova_a", "qb_a"]);
  s = act(s, "gain:lab"); // I S S
  assert.deepEqual(s.res, R(3, 2, 1));
  assert.equal(s.discard.length, 3);
  assert.equal(s.hand.length, 3);
});

test("an Action you cannot pay for is not offered", () => {
  const s = at({}, ["lab", "nova_a", "qb_a"]);
  assert.deepEqual(ids(s), ["gain:lab", "gain:nova_a", "gain:qb_a"]);
  assert.equal(whyNot(s, "nova_a"), "You cannot pay the cost.");
});

test("monument action: pay the cost, add a cube; two cubes complete it", () => {
  let s = at({}, ["nova_a", "lab", "qb_a"], { res: R(0, 3, 0) });
  s = act(s, "act:nova_a"); // III
  assert.deepEqual(s.res, R(0, 0, 0));
  assert.equal(s.mon.nova, 1);
  assert.equal(score(s).total, 1); // Rome only: one cube scores nothing
  s = reask(s, { hand: ["nova_b", "lab", "qb_a"], res: R(3, 0, 0) });
  s = act(s, "act:nova_b"); // SSS
  assert.equal(s.mon.nova, 2);
  assert.equal(score(s).total, 3); // Rome + Novastage 2
});

test("build: the structure stays in play and is not discarded", () => {
  let s = at({}, ["harvester", "lab", "qb_a"], { res: R(1, 2, 0) });
  s = act(s, "act:harvester");
  assert.deepEqual(s.built, ["harvester"]);
  assert.ok(!s.discard.includes("harvester"));
  assert.equal(s.discard.length, 2);
  assert.equal(score(s).total, 3);
});

test("structure bonus: +2 every time you gain that resource", () => {
  let s = at({}, ["mining", "lab", "qb_a"], { built: ["training"], res: R(0, 0, 0) });
  s = act(s, "gain:lab"); // I S S, no Military: no bonus
  assert.deepEqual(s.res, R(2, 1, 0));
  s = reask(s, { hand: ["flux_a", "nova_a", "qb_b"] });
  s = act(s, "gain:flux_a"); // M M +2
  assert.deepEqual(s.res, R(2, 1, 4));
});

test("resources stop at 9", () => {
  let s = at({}, ["mining", "lab", "qb_a"], { res: R(0, 8, 0) });
  s = act(s, "gain:mining");
  assert.equal(s.res.I, 9);
});

test("conquer: pay Military equal to cubes on the map, gain the location's resource", () => {
  let s = at({ map: "earth" }, ["conquest_a", "lab", "qb_a"], { res: R(0, 0, 1) });
  assert.equal(conquestCost(s), 1);
  s = act(s, "act:conquest_a");
  assert.equal(s.ask.kind, "location");
  s = act(s, "loc1"); // Industry on Earth
  assert.deepEqual(s.res, R(0, 1, 0));
  assert.deepEqual(s.locs, [0, 1]);
  assert.equal(conquestCost(s), 2);
  s = reask(s, { hand: ["conquest_b", "lab", "qb_a"], res: R(0, 0, 1) });
  assert.ok(!ids(s).includes("act:conquest_b"), "2 Military needed");
});

test("call for tribute: 1 of the resource per controlled location, Rome included", () => {
  let s = at({}, ["tribute_s", "lab", "qb_a"], { res: R(0, 0, 0), locs: [0, 1, 2] });
  s = act(s, "act:tribute_s");
  assert.deepEqual(s.res, R(3, 0, 0));
  s = reask(s, { hand: ["tribute_i", "lab", "qb_a"] });
  s = act(s, "act:tribute_i");
  assert.deepEqual(s.res, R(3, 3, 0));
});

test("round ends when the deck is empty at the start of a turn; invasion costs 2, 3, 5", () => {
  let s = toInvasion(at({}, ["lab", "nova_a", "qb_a"], { res: R(0, 0, 9) }));
  assert.equal(s.ask.cost, 2);
  assert.equal(s.ask.lose, 1);
  assert.equal(s.round, 1);
  const m = s.res.M;
  s = act(s, s.ask.options[0].id);
  assert.equal(s.res.M, m - 2);
  assert.equal(s.round, 2);
  assert.equal(s.deck.length + s.hand.length, 21);
  s = toInvasion(reask(s, { res: R(0, 0, 9) }));
  assert.equal(s.ask.cost, 3);
  s = act(s, s.ask.options[0].id);
  s = toInvasion(reask(s, { res: R(0, 0, 9) }));
  assert.equal(s.ask.cost, 5);
  assert.equal(s.ask.lose, 2);
  s = act(s, s.ask.options[0].id);
  assert.ok(s.over && !s.over.lost);
});

test("invasion you cannot pay: lose locations; losing Rome loses the game", () => {
  let s = toInvasion(at({}, ["lab", "nova_a", "qb_a"]));
  s = reask(s, { res: R(5, 5, 1), locs: [0, 3] });
  assert.deepEqual(ids(s), ["lose"]);
  s = act(s, "lose");
  assert.deepEqual(s.locs, [0]);
  assert.ok(!s.over);
  s = toInvasion(s);
  s = reask(s, { res: R(5, 5, 0), locs: [0] });
  s = act(s, "lose");
  assert.ok(s.over.lost);
});

test("Act III removes 2 locations; with one spare location Rome falls", () => {
  let s = toInvasion(at({}, ["lab", "nova_a", "qb_a"]));
  s = reask(s, { round: 3, res: R(0, 0, 0), locs: [0, 2] });
  s = act(s, "lose");
  assert.ok(s.over.lost);
});

test("built structures are not shuffled back", () => {
  let s = at({}, ["harvester", "lab", "qb_a"], { res: R(1, 2, 0) });
  s = act(s, "act:harvester");
  s = toInvasion(s);
  s = act(reask(s, { res: R(0, 0, 2) }), "0,0,2");
  assert.equal(s.deck.length + s.hand.length, 20);
});

test("scoring example from the rulebook: 5 locations, Solar Harvester, Datavault, Orbital Fluxway = 16", () => {
  const s = reask(newGame({}, 1), { locs: [0, 1, 2, 3, 4], built: ["harvester"], mon: { nova: 0, qb: 0, urbis: 0, vault: 2, flux: 2, mars: 0 } });
  assert.equal(score(s).total, 16);
});

// ---------- monument tiles ----------
const tiled = (tiles, patch) => reask(newGame({ tiles }, 1), patch);
const allMon = (v, over = {}) => ({ nova: v, qb: v, urbis: v, vault: v, flux: v, mars: v, ...over });

test("Novastage basic: 2 VP, Science and Military interchangeable for gains and costs", () => {
  let s = at({}, ["lab", "mars_a", "qb_a"], { mon: allMon(0, { nova: 2 }), res: R(0, 0, 3) });
  assert.equal(tileVP(s, "nova"), 2);
  assert.ok(ids(s).includes("act:mars_a"), "SSS payable with Military");
  assert.deepEqual(gainOptions(s, [R(2, 1, 0)]).map((v) => `${v.S}${v.I}${v.M}`).sort(), ["012", "111", "210"]);
  assert.equal(payOptions(s, { fixed: { S: 3 } }).length, 1);
});
test("Novastage II: 3 VP, Science and Industry interchangeable", () => {
  const s = at({ tiles: { nova: 2 } }, ["lab", "mars_b", "qb_a"], { mon: allMon(0, { nova: 2 }), res: R(2, 0, 1) });
  assert.equal(tileVP(s, "nova"), 3);
  assert.ok(ids(s).includes("act:mars_b"), "IIM payable with Science");
});
test("Novastage I: gaining resources also gains another card's resources", () => {
  let s = at({ tiles: { nova: 1 } }, ["lab", "mars_b", "qb_a"], { mon: allMon(0, { nova: 2 }), res: R(0, 0, 0) });
  assert.equal(tileVP(s, "nova"), 0);
  s = act(s, "gain:lab");
  assert.equal(s.ask.kind, "also");
  s = act(s, "mars_b");
  assert.deepEqual(s.res, R(2, 1, 2));
});
test("Orbit Urbis: basic 1 per structure; I: 5 minus structures; II: 1 + structure VP again", () => {
  const built = ["harvester", "mining", "holo"];
  assert.equal(tileVP(tiled({}, { built }), "urbis"), 3);
  assert.equal(tileVP(tiled({ urbis: 1 }, { built }), "urbis"), 2);
  assert.equal(tileVP(tiled({ urbis: 2 }, { built }), "urbis"), 5);
});
test("Quantum Barterdeck: basic least resource; I: sets of 3 of one type; II: 3 per resource at 0", () => {
  assert.equal(tileVP(tiled({}, { res: R(4, 2, 7) }), "qb"), 2);
  assert.equal(tileVP(tiled({ qb: 1 }, { res: R(4, 2, 7) }), "qb"), 2);
  assert.equal(tileVP(tiled({ qb: 2 }, { res: R(0, 2, 0) }), "qb"), 6);
});
test("Data Vault: basic 4; I: 2 per 3 cubes on monuments; II: 2 per adjacent completed monument", () => {
  assert.equal(tileVP(tiled({}, {}), "vault"), 4);
  assert.equal(tileVP(tiled({ vault: 1 }, { mon: allMon(1, { vault: 2 }) }), "vault"), 4); // 7 cubes
  assert.equal(tileVP(tiled({ vault: 2 }, { mon: allMon(2, { nova: 0, flux: 0 }) }), "vault"), 6);
  assert.equal(tileVP(tiled({ vault: 2 }, { mon: allMon(0, { vault: 2, nova: 2, flux: 2 }) }), "vault"), 0);
});
test("Orbital Fluxway: basic 1 per location; I: 4 if only Rome; II: 3 and 2 resources of choice on conquest", () => {
  assert.equal(tileVP(tiled({}, { locs: [0, 1, 2] }), "flux"), 3);
  assert.equal(tileVP(tiled({ flux: 1 }, { locs: [0] }), "flux"), 4);
  assert.equal(tileVP(tiled({ flux: 1 }, { locs: [0, 1] }), "flux"), 0);
  let s = at({ tiles: { flux: 2 } }, ["conquest_a", "lab", "qb_a"], { mon: allMon(0, { flux: 2 }), res: R(0, 0, 1) });
  assert.equal(tileVP(s, "flux"), 3);
  s = act(act(s, "act:conquest_a"), "loc1");
  assert.equal(s.ask.kind, "gainAs");
  assert.equal(s.ask.options.length, 6);
  s = act(s, "0,0,2");
  assert.deepEqual(s.res, R(0, 0, 2));
});
test("RSS Mars 1 basic: 2 VP, invasions ignored", () => {
  let s = at({}, ["lab", "nova_a", "qb_a"], { mon: allMon(0, { mars: 2 }), res: R(0, 0, 0) });
  s = until(s, (x) => x.round === 2);
  assert.deepEqual(s.locs, [0]);
  assert.equal(tileVP(s, "mars"), 2);
});
test("RSS Mars 1 variant I: 3 VP, any one resource type pays for the invasion", () => {
  let s = toInvasion(at({ tiles: { mars: 1 } }, ["lab", "nova_a", "qb_a"], { mon: allMon(0, { mars: 2 }) }));
  s = reask(s, { res: R(2, 1, 1) });
  assert.deepEqual(ids(s), ["2,0,0", "lose"]);
  assert.equal(tileVP(s, "mars"), 3);
});
test("RSS Mars 1 variant II: 1 VP, a free conquest after each invasion", () => {
  let s = toInvasion(at({ tiles: { mars: 2 } }, ["lab", "nova_a", "qb_a"], { mon: allMon(0, { mars: 2 }) }));
  s = reask(s, { res: R(0, 0, 2) });
  s = act(s, "0,0,2");
  assert.equal(s.ask.kind, "location");
  s = act(s, "loc2"); // Science on Earth
  assert.deepEqual(s.locs, [0, 2]);
  assert.deepEqual(s.res, R(1, 0, 0));
  assert.equal(tileVP(s, "mars"), 1);
});

// ---------- leaders ----------
test("Calculigula: 2 VP per monument with exactly 1 cube; set 2 resource types to 0 after invasions 1 and 2", () => {
  let s = at({ leader: "calculigula" }, ["lab", "nova_a", "qb_a"], { mon: allMon(0, { nova: 1, qb: 1, vault: 2 }) });
  assert.equal(score(s).total, 1 + 2 + 2 + 4);
  s = toInvasion(s);
  s = act(reask(s, { res: R(4, 5, 6) }), "0,0,2");
  assert.equal(s.ask.kind, "waste");
  s = act(s, "keepI");
  assert.equal(s.res.S, 0); assert.equal(s.res.M, 0); assert.ok(s.res.I >= 5);
});
test("Commodorus: structures start in the discard pile and cannot be built; 0 resources refill by 1 each turn", () => {
  let s = newGame({ leader: "commodorus" }, 3);
  assert.equal(s.discard.length, 5);
  assert.equal(s.deck.length + s.hand.length, 16);
  s = at({ leader: "commodorus" }, ["mining", "lab", "nova_a"], { res: R(0, 9, 0), deck: ["qb_a", "qb_b", "urbis_a"] });
  assert.ok(!ids(s).includes("act:mining"));
  s = act(s, "gain:nova_a"); // S S; then Hercules gives 1 Military at the start of the next turn
  assert.deepEqual(s.res, R(2, 9, 1));
});
test("Starjan: +1 VP per location, conquest costs 2 more", () => {
  const s = at({ leader: "starjan" }, ["conquest_a", "lab", "qb_a"], { res: R(0, 0, 2), locs: [0, 4] });
  assert.equal(conquestCost(s), 4);
  assert.ok(!ids(s).includes("act:conquest_a"));
  assert.equal(score(s).total, 4);
});
test("Kallax Calla: 22 cards, -2 VP, the Edict copies a discarded card's action", () => {
  let s = newGame({ leader: "kallax" }, 3);
  assert.equal(s.deck.length + s.hand.length, 22);
  assert.equal(score(s).total, -1);
  s = at({ leader: "kallax" }, ["edict", "lab", "qb_a"], { res: R(0, 3, 1), discard: ["nova_a", "tribute_s", "harvester"], locs: [0, 1] });
  assert.deepEqual(ids(s).filter((x) => x.startsWith("edict")), ["edict:edict:nova_a", "edict:edict:tribute_s"]);
  const t = act(s, "edict:edict:tribute_s");
  assert.deepEqual(t.res, R(2, 3, 0));
  const m = act(s, "edict:edict:nova_a");
  assert.deepEqual(m.res, R(0, 0, 0));
  assert.equal(m.mon.nova, 1);
});
test("Edict copying a structure builds it from the discard pile", () => {
  let s = at({ leader: "kallax" }, ["edict", "lab", "qb_a"], { res: R(1, 2, 1), discard: ["harvester"] });
  s = act(s, "edict:edict:harvester");
  assert.deepEqual(s.built, ["harvester"]);
  assert.ok(!s.discard.includes("harvester"));
  assert.ok(s.discard.includes("edict"));
});
test("Voidspasian: resources start at 0, +1 VP per completed monument", () => {
  const s = newGame({ leader: "voidspasian" }, 3);
  assert.deepEqual(s.res, R(0, 0, 0));
  assert.equal(score(reask(s, { mon: allMon(0, { vault: 2, nova: 1 }) })).total, 1 + 5);
});
test("Cyberius: third card face down, 1 resource flips it; Treason Trials removes the card for +1", () => {
  let s = newGame({ leader: "cyberius" }, 3);
  assert.equal(s.faceDown, s.hand[2]);
  assert.ok(!ids(s).some((x) => x.endsWith(":" + s.hand[2])));
  const f = act(s, "flip:S");
  assert.equal(f.faceDown, null);
  assert.equal(f.res.S, 0);
  assert.ok(ids(f).includes("gain:" + f.hand[2]));
  s = at({ leader: "cyberius" }, ["lab", "nova_a", "qb_a"], { res: R(0, 0, 0) });
  s = act(s, "gain:lab");
  assert.equal(s.ask.kind, "treason");
  assert.deepEqual(ids(s), ["keep", "rm:S", "rm:I"]);
  s = act(s, "rm:I");
  assert.deepEqual(s.res, R(2, 2, 0));
  assert.deepEqual(s.removed, ["lab"]);
  assert.ok(!s.discard.includes("lab"));
});

// ---------- campaign 1 ----------
test("I.II Emperor: after building, pay 2 Industry for a cube worth 1 VP", () => {
  let s = at({ scenario: "1.2e" }, ["harvester", "lab", "qb_a"], { res: R(1, 4, 0) });
  s = act(s, "act:harvester");
  assert.equal(s.ask.kind, "yesno");
  s = act(s, "yes");
  assert.equal(s.res.I, 0);
  assert.equal(score(s).total, 1 + 2 + 1);
});
test("I.II Dictator: one extra resource of each type", () => {
  assert.deepEqual(newGame({ scenario: "1.2d" }, 1).res, R(2, 2, 2));
});
test("I.III Emperor: 1 VP per invasion repelled with Military, +1 for all three", () => {
  let s = at({ scenario: "1.3e" }, ["lab", "nova_a", "qb_a"]);
  for (let r = 1; r <= 3; r++) { s = toInvasion(reask(s, { res: R(0, 0, 9) })); s = act(reask(s, { res: R(0, 0, 9) }), s.ask.options[0].id); }
  assert.ok(s.over);
  assert.equal(result(s).lines.find((l) => l[0].includes("repelled"))[1], 4);
});
test("I.III Dictator: a monument of your choice starts completed", () => {
  let s = newGame({ scenario: "1.3d" }, 1);
  assert.equal(s.ask.kind, "monument");
  s = act(s, "vault");
  assert.equal(s.mon.vault, 2);
  assert.equal(score(s).total, 5);
});
test("I.III Tyrant: Mining Colony starts built", () => {
  const s = newGame({ scenario: "1.3t" }, 1);
  assert.deepEqual(s.built, ["mining"]);
  assert.equal(s.deck.length + s.hand.length, 20);
});
test("I.IV Emperor: you sort the deck", () => {
  let s = newGame({ scenario: "1.4e" }, 1);
  assert.equal(s.ask.kind, "order");
  const order = [...BASE_DECK].reverse();
  s = act(s, order);
  assert.deepEqual(s.hand, order.slice(0, 3));
});
test("I.IV Dictator: +2 VP per completed monument", () => {
  assert.equal(score(reask(newGame({ scenario: "1.4d" }, 1), { mon: allMon(0, { vault: 2 }) })).total, 1 + 6);
});
test("I.IV Tyrant: 2 VP per location; losing a location loses the game", () => {
  let s = at({ scenario: "1.4t" }, ["lab", "nova_a", "qb_a"], { locs: [0, 1, 2] });
  assert.equal(score(s).total, 6);
  s = act(reask(toInvasion(s), { res: R(0, 0, 0) }), "lose");
  assert.ok(s.over.lost);
});

// ---------- campaign 2 ----------
test("II.I Crisis: 3 starting locations, each invasion resolved twice, RSS Mars 1 cancels one", () => {
  let s = newGame({ scenario: "2.1" }, 1);
  for (let i = 0; i < 3; i++) { assert.equal(s.ask.kind, "location"); s = act(s, s.ask.options[0].id); }
  assert.equal(s.locs.length, 4);
  assert.deepEqual(s.res, R(1, 1, 1));
  s = toInvasion(s);
  s = act(reask(s, { res: R(0, 0, 4) }), "0,0,2");
  assert.equal(s.ask.kind, "invasion");
  assert.equal(s.round, 1);
  s = act(s, "0,0,2");
  assert.equal(s.round, 2);
  s = toInvasion(reask(s, { mon: allMon(0, { mars: 2 }), res: R(0, 0, 3) }));
  s = act(s, "0,0,3"); // the first is ignored, the second is paid
  assert.equal(s.round, 3);
});
test("II.II Ludem et Circenses: an RSS Mars 1 card can add a cube for any 3 resources; -2 / 0 / +2 VP", () => {
  let s = at({ scenario: "2.2l" }, ["mars_a", "lab", "qb_a"], { res: R(1, 1, 1) });
  assert.equal(score(s).total, -1);
  s = act(s, "alt:mars_a");
  assert.deepEqual(s.res, R(0, 0, 0));
  assert.equal(s.cubes, 1);
  assert.equal(score(s).total, 1);
  assert.equal(score(reask(s, { cubes: 2 })).total, 3);
});
test("II.II Inflation: before each invasion pay 2 resources per structure, or lose", () => {
  let s = at({ scenario: "2.2i" }, ["lab", "nova_a", "qb_a"], { built: ["harvester"] });
  s = until(s, (x) => x.ask.kind === "pay" || x.ask.kind === "invasion");
  assert.equal(s.ask.kind, "pay");
  let t = at({ scenario: "2.2i" }, ["lab", "nova_a", "qb_a"], { built: ["harvester", "holo", "mining", "training"], deck: [], res: R(1, 1, 1) });
  t = act(t, "gain:nova_a"); // 3 + 2 = 5 resources (Training bonus needs Military), 8 needed
  assert.ok(t.over && t.over.lost);
});
test("II.III Plunder: each invasion removes a monument cube, even with RSS Mars 1; none to remove loses", () => {
  let p = at({ scenario: "2.3pl" }, ["lab", "nova_a", "qb_a"], { mon: allMon(0, { mars: 2, nova: 1 }), deck: [] });
  p = act(p, "gain:lab");
  assert.equal(p.ask.kind, "unbuild");
  p = act(p, "nova");
  assert.equal(p.round, 2, "RSS Mars 1 still ignores the invasion");
  let q = at({ scenario: "2.3pl" }, ["lab", "nova_a", "qb_a"], { deck: [] });
  q = act(q, "gain:lab");
  assert.ok(q.over.lost);
});
test("II.III Poverty: 2 random cards leave the game", () => {
  const s = newGame({ scenario: "2.3po" }, 1);
  assert.equal(s.removed.length, 2);
  assert.equal(s.deck.length + s.hand.length, 19);
});
test("II.IV Decay: each monument is worth 2 less", () => {
  assert.equal(score(reask(newGame({ scenario: "2.4d" }, 1), { mon: allMon(0, { vault: 2 }) })).total, 1 + 2);
});
test("II.IV Corruption: tribute may add a cube for 2 Science or 1 Military; under 3 cubes loses", () => {
  let s = at({ scenario: "2.4c" }, ["tribute_i", "lab", "qb_a"], { res: R(2, 0, 1) });
  s = act(s, "act:tribute_i");
  assert.equal(s.ask.kind, "bribe");
  assert.deepEqual(ids(s), ["2,0,0", "0,0,1", "no"]);
  s = act(s, "0,0,1");
  assert.equal(s.cubes, 1);
  assert.deepEqual(s.res, R(2, 1, 0));
  let e = at({ scenario: "2.4c" }, ["lab", "nova_a", "qb_a"], { round: 3, deck: [], res: R(0, 0, 9), cubes: 2 });
  e = until(e, (x) => x.over);
  assert.ok(e.over.lost);
  let w = at({ scenario: "2.4c" }, ["lab", "nova_a", "qb_a"], { round: 3, deck: [], res: R(0, 0, 9), cubes: 3 });
  w = until(w, (x) => x.over);
  assert.ok(!w.over.lost);
});
test("campaign links: every win and lose target exists or is a final result", () => {
  const finals = ["Overwhelming Victory", "Victory", "Narrow Victory", "Narrow Defeat", "Defeat", "Overwhelming Defeat"];
  for (const sc of Object.values(SCENARIOS)) for (const t of [sc.win, sc.lose]) {
    if (t[0] === "=") assert.ok(finals.includes(t.slice(1)), t);
    else { assert.ok(SCENARIOS[t], t); assert.ok(+t[2] === +sc.id[2] + 1 || (sc.id === "2.4d" && t === "2.4c"), `${sc.id} -> ${t}`); }
  }
});

// ---------- review findings ----------
test("review: Voidspasian in I.II Dictator starts with 2 of each (the scenario takes precedence)", () => {
  assert.deepEqual(newGame({ scenario: "1.2d", leader: "voidspasian" }, 1).res, R(2, 2, 2));
});
test("review: I.III Emperor does not count an invasion paid in Science through RSS Mars 1 variant I", () => {
  let s = toInvasion(at({ scenario: "1.3e", tiles: { mars: 1 } }, ["lab", "nova_a", "qb_a"], { mon: allMon(0, { mars: 2 }) }));
  s = reask(s, { res: R(2, 0, 2) });
  assert.equal(act(s, "2,0,0").repelled, 0);
  assert.equal(act(s, "0,0,2").repelled, 1);
});
test("review: Hercules does not trigger when the deck is empty and the round ends", () => {
  let s = at({ leader: "commodorus" }, ["lab", "nova_a", "qb_a"], { deck: [], res: R(0, 0, 0), locs: [0, 1] });
  s = act(s, "gain:nova_a");
  assert.equal(s.ask.kind, "invasion");
  assert.deepEqual(s.res, R(2, 0, 0));
});
