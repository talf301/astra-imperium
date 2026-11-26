// Astra Imperium: interface. It shows the engine's current decision (state.ask) and answers it with act().
// It computes no rules: legality, costs, gains and scores all come from the engine.
import { newGame, act, score, result, whyNot, gainOptions, payOptions, conquestCost, randomTiles, tileVP, STATE_VERSION } from "./engine/game.mjs";
import { CARDS, MONUMENTS, MON_NAME, TILE_TEXT, MAPS, LEADERS, SCENARIOS, CAMPAIGNS, DIFFICULTY, RES, RES_NAME, INVASIONS } from "./engine/data.mjs";
import { VERSION } from "./version.mjs";
import { TUTORIAL_SETUP, TUTORIAL_SEED, SCRIPT, scriptStep, scriptNext } from "./tutorial.mjs";

const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("astra." + k)); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem("astra." + k) : localStorage.setItem("astra." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};

let G = null; // game state
let undo = null; // state to return to: the last point where hidden information was revealed
const U = { screen: "home", sel: null, sheet: null, order: [], recorded: false, tp: 0 };
let prefs = store.get("prefs") || { map: "earth", leader: null, tiles: "basic", custom: {} };
let camp = store.get("campaign") || {}; // {c1: {...}, c2: {...}}

// ---------- small html helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ICON = {
  S: '<svg class="ic S" viewBox="0 0 24 24"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9 5.3v-3l-2.4-.5a7 7 0 0 0-.8-1.9l1.4-2-2.1-2.2-2.1 1.4a7 7 0 0 0-1.9-.8L12.600 2h-3l-.5 2.500a7 7 0 0 0-1.900.8l-2-1.400L3 6.100l1.400 2a7 7 0 0 0-.8 1.900L1.200 10.500v3l2.400.5a7 7 0 0 0 .8 1.900l-1.400 2 2.200 2.200 2-1.400a7 7 0 0 0 1.900.8l.5 2.500h3l.5-2.500a7 7 0 0 0 1.900-.8l2.100 1.400 2.100-2.200-1.400-2a7 7 0 0 0 .8-1.900Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  I: '<svg class="ic I" viewBox="0 0 24 24"><path d="M9 2.500 3.500 8.500 5 18l5 3.500 6.500-1L20.500 14 19 6.500 14 3Z M9 2.500 10.500 9 5 18M10.500 9l6 2.500L19 6.500M16.500 11.500l0 9M10.500 9 14 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  M: '<svg class="ic M" viewBox="0 0 24 24"><path d="M5 22V3M5 4h14l-3.500 4.500L19 13H5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/><circle cx="10.500" cy="8.500" r="1.800" fill="currentColor"/></svg>',
  VP: '<svg class="ic VP" viewBox="0 0 24 24"><path d="M12 21c-5-1-8.500-5-8.500-10 0-3 1-5.500 2.500-7.500M12 21c5-1 8.500-5 8.500-10 0-3-1-5.500-2.500-7.500M3.800 8l3 1.500M3.600 12.500l3.200.3M5.300 16.500l2.900-1.200M20.200 8l-3 1.500M20.400 12.500l-3.200.3M18.700 16.500l-2.900-1.200" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linecap="round"/></svg>',
};
const icons = (v, sign = "") => RES.filter((r) => v[r]).map((r) => `<span class="amt ${r}">${sign}${v[r]}${ICON[r]}</span>`).join(" ") || '<span class="amt">nothing</span>';
const vp = (n) => `<span class="amt VP">${n}${ICON.VP}</span>`;
const roman = (n) => "I".repeat(n);
const cardImg = (id) => `<img src="img/c/${id}.webp" alt="${esc(CARDS[id] ? CARDS[id].name : "card")}" draggable="false">`;
const btn = (label, act_, id = "", cls = "", small = "", dis = false) =>
  `<button class="btn ${cls}" data-act="${act_}" data-id="${esc(id)}" ${dis ? "disabled" : ""}><span>${label}</span>${small ? `<small>${small}</small>` : ""}</button>`;

// ---------- persistence and flow ----------
function save() {
  store.set("save", G ? { v: STATE_VERSION, state: G, undo, recorded: U.recorded } : null);
  store.set("prefs", prefs);
  store.set("campaign", camp);
}
function load() {
  const s = store.get("save");
  if (!s || s.v !== STATE_VERSION || !s.state || s.state.v !== STATE_VERSION) return false;
  G = s.state; undo = s.undo || null; U.recorded = !!s.recorded;
  return true;
}
function setState(next) {
  if (!undo || next.hid !== undo.hid || next.over) undo = next.over ? null : next;
  G = next;
  U.sel = null;
  U.order = [];
  if (G.over) finishGame();
  save();
  render();
}
function answer(id) {
  try {
    const onScript = G.tut != null;
    const tut = scriptNext(G, id);
    const next = act(G, id);
    next.tut = tut;
    U.tp = 0;
    setState(next);
    if (onScript && tut == null && !next.over) toast("You left the tutorial's path. Play on as you like.");
  } catch (e) { console.error(e); toast(e.message); }
}
function tilesFor(mode, seed) {
  if (mode === "random") return randomTiles(seed);
  if (mode === "custom") return { ...prefs.custom };
  return {};
}
function startGame(setup, fixedSeed) {
  const seed = fixedSeed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  if (setup.tiles === undefined) setup.tiles = tilesFor(prefs.tiles, seed);
  undo = null; U.recorded = false; G = null;
  U.screen = "game";
  U.tp = 0;
  const g = newGame(setup, seed);
  if (fixedSeed != null) g.tut = 0;
  setState(g);
}

// ---------- tutorial coach ----------
const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\{(S|I|M|VP)\}/g, (m, k) => ICON[k]);
function coachHtml() {
  const step = G && scriptStep(G);
  if (!step) return "";
  const n = step.pages.length, i = Math.min(U.tp, n - 1), last = i === n - 1;
  const nav = last ? (step.want ? "" : btn("Finish the tutorial", "tutend", "", "gold grow")) : btn("Next", "tutnext", "", "gold grow");
  return `<div class="coach"><div class="chead"><span>Tutorial · step ${step.index + 1} of ${step.total}</span><span>${n > 1 ? `${i + 1} / ${n}` : ""}</span></div>
    <p>${rich(step.pages[i].text)}</p>${nav ? `<div class="cnav">${i > 0 ? btn("Back", "tutback", "", "grow") : ""}${nav}</div>` : ""}</div>`;
}
// Point at what the coach is talking about, and at the tap a step asks for.
function coachMarks() {
  const step = G && U.screen === "game" && scriptStep(G);
  if (!step) return;
  const n = step.pages.length, i = Math.min(U.tp, n - 1);
  const f = step.pages[i].focus && document.querySelector(step.pages[i].focus);
  if (f) f.classList.add("tut-focus");
  if (i < n - 1 || !step.want) return;
  let el = null;
  if (G.ask.kind === "play") {
    const card = step.want.split(":")[1];
    el = U.sel === card ? document.querySelector(`[data-act="answer"][data-id="${step.want}"]`) : document.querySelector(`[data-act="card"][data-id="${card}"]`);
  } else el = document.querySelector(`[data-act="answer"][data-id="${step.want}"]`);
  if (el) el.classList.add("tut-want");
}
// Record a finished scenario in its campaign, once.
function finishGame() {
  if (U.recorded) return;
  U.recorded = true;
  const sid = G.setup.scenario;
  if (!sid) return;
  const sc = SCENARIOS[sid];
  const c = camp[sc.campaign];
  if (!c || c.scenario !== sid) return;
  const r = result(G);
  const next = r.won ? sc.win : sc.lose;
  c.history.push({ scenario: sid, total: r.total, won: r.won });
  if (next[0] === "=") { c.final = next.slice(1); c.scenario = null; } else c.scenario = next;
}

// ---------- screens ----------
function home() {
  const has = load() && !G.over;
  const cbtn = (id) => {
    const c = camp[id], C = CAMPAIGNS[id];
    const sub = !c ? "Not started" : c.final ? `Ended: ${c.final}` : `Stage ${SCENARIOS[c.scenario].stage} · ${DIFFICULTY[c.difficulty]}`;
    return btn(`Campaign ${C.num}: ${C.name}`, "campaign", id, "wide", sub);
  };
  return `<div class="home">
    <div class="hero"><img src="img/c/back.webp" alt="Astra Imperium" draggable="false"></div>
    <div class="menu">
      ${has ? btn("Continue", "continue", "", "gold wide", G.setup.scenario ? `Scenario ${SCENARIOS[G.setup.scenario].stage} · Act ${roman(G.round)}` : `${G.tut != null ? "Tutorial" : "Standard game"} · Act ${roman(G.round)}`) : ""}
      ${btn("Standard game", "setup", "", has ? "wide" : "gold wide")}
      ${cbtn("c1")}${cbtn("c2")}
      <div class="acts">${btn("Guided tutorial", "tutorial", "", "grow ghost", "learn in one coached round")}${btn("How to play", "sheet", "rules", "grow ghost", "rules summary")}</div>
    </div>
    <div class="ver">Unofficial fan build · version ${VERSION}</div>
  </div>`;
}

function leaderPicker() {
  const cell = (id) => `<button class="lead ${prefs.leader === id ? "on" : ""}" data-act="leader" data-id="${id || ""}">${id ? `<img src="img/l/${id}.webp" alt="" draggable="false">` : '<div class="nolead">No leader</div>'}<span>${id ? LEADERS[id].name : "None"}</span></button>`;
  const L = prefs.leader && LEADERS[prefs.leader];
  return `<h3>Leader</h3><div class="leads">${[null, ...Object.keys(LEADERS)].map(cell).join("")}</div>
    ${L ? `<div class="note"><b class="good">+</b> ${esc(L.plus)}<br><b class="bad">−</b> ${esc(L.minus)}</div>` : ""}`;
}
function tilePicker() {
  const seg = ["basic", "random", "custom"].map((m) => `<button class="${prefs.tiles === m ? "on" : ""}" data-act="tilemode" data-id="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("");
  let body = "";
  if (prefs.tiles === "custom") {
    body = `<div class="tiles pick">${MONUMENTS.map((k) => { const t = prefs.custom[k] || 0; return `<button class="tile" data-act="tilecycle" data-id="${k}"><img src="img/t/${k}_${t}.webp" alt="" draggable="false"><span>${["Basic", "Variant I", "Variant II"][t]}</span></button>`; }).join("")}</div><div class="note">Tap a monument to change its tile.</div>`;
  } else body = `<div class="note">${prefs.tiles === "basic" ? "The monuments printed on the Monument Board." : "One of the 3 tiles of each monument, picked at random."}</div>`;
  return `<h3>Monuments</h3><div class="seg">${seg}</div>${body}`;
}
function setupScreen() {
  const maps = Object.keys(MAPS).map((m) => `<button class="mapopt ${prefs.map === m ? "on" : ""}" data-act="map" data-id="${m}"><img src="img/map/${m}.webp" alt="" draggable="false"><span>${MAPS[m].name}</span></button>`).join("");
  return `<div class="page"><header class="bar"><button class="iconbtn" data-act="home">‹</button><h2>Standard game</h2><span class="iconbtn"></span></header>
    <div class="scroll">
      <h3>Map</h3><div class="maps">${maps}</div>
      ${leaderPicker()}
      ${tilePicker()}
    </div>
    <footer class="foot">${btn("Begin", "start", "", "gold wide")}</footer></div>`;
}
function campaignScreen() {
  const id = U.camp, C = CAMPAIGNS[id];
  const c = camp[id];
  let body;
  if (!c) {
    body = `<div class="hero small"><img src="img/s/${id}.webp" alt="" draggable="false"></div><p class="note">${esc(C.blurb)}</p>
      <h3>Difficulty</h3><div class="seg">${DIFFICULTY.map((d, i) => `<button class="${(U.diff ?? 1) === i ? "on" : ""}" data-act="diff" data-id="${i}">${d}</button>`).join("")}</div>
      <div class="note">The difficulty holds for the whole campaign: it picks which VP goal on each scenario card you must reach.</div>`;
  } else if (c.final) {
    body = `<div class="final"><h2>${esc(c.final)}</h2></div>${historyList(c)}`;
  } else {
    const sc = SCENARIOS[c.scenario];
    body = `<button class="scard" data-act="zoomimg" data-id="img/s/${sc.id}.webp"><img src="img/s/${sc.id}.webp" alt="" draggable="false"></button>
      <div class="note"><b>${sc.stage} ${esc(sc.title)}.</b> ${esc(sc.text)}<br>Goal (${DIFFICULTY[c.difficulty]}): ${vp(sc.goals[c.difficulty])}</div>
      ${historyList(c)}${leaderPicker()}${tilePicker()}`;
  }
  const foot = !c ? btn("Start campaign", "campstart", id, "gold wide") : c.final ? `${btn("Play again", "campreset", id, "wide")}` : `${btn("Begin scenario", "campplay", id, "gold wide")}`;
  return `<div class="page"><header class="bar"><button class="iconbtn" data-act="home">‹</button><h2>${C.name}</h2><span class="iconbtn"></span></header>
    <div class="scroll">${body}${c && !c.final ? `<button class="link" data-act="campreset" data-id="${id}">Abandon this campaign</button>` : ""}</div><footer class="foot">${foot}</footer></div>`;
}
const historyList = (c) => (c.history.length ? `<div class="hist">${c.history.map((h) => `<div><span>${SCENARIOS[h.scenario].stage} ${esc(SCENARIOS[h.scenario].title)}</span><b class="${h.won ? "good" : "bad"}">${h.won ? "Victory" : "Defeat"} · ${h.total} VP</b></div>`).join("")}</div>` : "");

// ---------- game screen ----------
function mapView(big) {
  const M = MAPS[G.setup.map];
  const a = G.ask || {};
  const picking = big && (a.kind === "location" || a.kind === "loseLocation");
  const marks = M.locs.map(([r, x, y], i) => {
    const n = i + 1, mine = G.locs.includes(n);
    const opt = picking && a.options.find((o) => o.loc === n);
    const cls = `loc ${mine ? "mine" : ""} ${opt ? "opt" : ""}`;
    const inner = mine ? '<i class="cube"></i>' : "";
    return opt ? `<button class="${cls}" style="left:${x * 100}%;top:${y * 100}%" data-act="answer" data-id="${opt.id}" aria-label="location ${n}">${inner}</button>` : `<span class="${cls}" style="left:${x * 100}%;top:${y * 100}%">${inner}</span>`;
  }).join("");
  const rome = `<span class="loc mine" style="left:${M.rome[0] * 100}%;top:${M.rome[1] * 100}%">${G.locs.includes(0) ? '<i class="cube"></i>' : ""}</span>`;
  const inner = `<img src="img/map/${G.setup.map}.webp" alt="map" draggable="false">${marks}${rome}`;
  return big ? `<div class="map big">${inner}</div>` : `<button class="map" data-act="sheet" data-id="map">${inner}</button>`;
}
function monView(pickable) {
  const a = G.ask || {};
  return `<div class="mons ${pickable ? "pick" : ""}">${MONUMENTS.map((k) => {
    const opt = pickable && a.options.find((o) => o.mon === k);
    const pips = `<i class="pips">${[0, 1].map((i) => `<b class="${G.mon[k] > i ? "on" : ""}"></b>`).join("")}</i>`;
    return `<button class="mon ${G.mon[k] === 2 ? "done" : ""} ${pickable && !opt ? "off" : ""}" data-act="${opt ? "answer" : "sheet"}" data-id="${opt ? opt.id : "mon:" + k}"><img src="img/t/${k}_${G.setup.tiles[k]}.webp" alt="${MON_NAME[k]}" draggable="false">${pips}</button>`;
  }).join("")}</div>`;
}
function chips() {
  const out = [];
  const inv = INVASIONS[G.round];
  out.push(`<button class="chip" data-act="sheet" data-id="invader">Invasion ${roman(G.round)}: ${inv.cost}${ICON.M} or −${inv.lose} loc</button>`);
  for (const id of G.built) out.push(`<button class="chip built" data-act="zoom" data-id="${id}">${esc(CARDS[id].name)} ${CARDS[id].vp ? vp(CARDS[id].vp) : `<span class="amt ${CARDS[id].bonus}">+2${ICON[CARDS[id].bonus]}</span>`}</button>`);
  if (G.setup.leader) out.push(`<button class="chip lead" data-act="sheet" data-id="leader">${LEADERS[G.setup.leader].name}</button>`);
  if (G.setup.scenario) {
    const sc = SCENARIOS[G.setup.scenario];
    const cubes = ["patricians", "circus", "corruption"].includes(sc.rule) ? ` · ${G.cubes} cube${G.cubes === 1 ? "" : "s"}` : sc.rule === "repel" ? ` · ${G.repelled} repelled` : "";
    out.push(`<button class="chip scen" data-act="sheet" data-id="scenario">${sc.stage} ${esc(sc.title)}${cubes} · goal ${sc.goals[G.setup.difficulty]}</button>`);
  }
  return `<div class="chips">${out.join("")}</div>`;
}
function playLabel(o) {
  const c = CARDS[o.card];
  if (o.type === "gain") {
    const outs = gainOptions(G, [c.gain]);
    const nova1 = G.mon.nova === 2 && G.setup.tiles.nova === 1;
    return btn("Resources", "answer", o.id, "gold grow", (outs.length === 1 ? icons(outs[0], "+") : icons(c.gain, "+") + " · you choose") + (nova1 ? " + another card" : ""));
  }
  if (o.type === "alt") return btn("Circus games", "answer", o.id, "grow", "Pay any 3 · add a cube");
  if (o.type === "edict") return btn(`Copy ${esc(CARDS[o.target].name)}`, "answer", o.id, "grow", `Pay ${icons(c.cost)} + its cost`);
  const pays = payOptions(G, c.kind === "conq" ? { fixed: { M: conquestCost(G) } } : { fixed: c.cost });
  const cost = c.kind === "trib" ? "" : `Pay ${icons(c.kind === "conq" ? { S: 0, I: 0, M: conquestCost(G) } : c.cost)}${pays.length > 1 ? " · you choose" : ""}`;
  if (c.kind === "mon") return btn(G.mon[c.mon] === 1 ? "Complete monument" : "Work on monument", "answer", o.id, "grow", cost);
  if (c.kind === "str") return btn("Build", "answer", o.id, "grow", cost);
  if (c.kind === "conq") return btn("Conquer", "answer", o.id, "grow", cost);
  const t = gainOptions(G, [{ S: 0, I: 0, M: 0, [c.trib]: G.locs.length }]);
  return btn("Call for tribute", "answer", o.id, "grow", t.length === 1 ? icons(t[0], "+") : `+${G.locs.length}${ICON[c.trib]} · you choose`);
}
function handView() {
  const a = G.ask;
  const play = a && a.kind === "play";
  const cards = G.hand.map((id) => {
    if (id === G.faceDown) return `<button class="card down" data-act="facedown"><img src="img/c/back.webp" alt="face-down card" draggable="false"></button>`;
    return `<button class="card ${U.sel === id ? "sel" : ""} ${play ? "" : "idle"}" data-act="card" data-id="${id}">${cardImg(id)}</button>`;
  }).join("");
  return `<div class="hand"><div class="cards n${G.hand.length}">${cards}</div></div>`;
}
function actionBar() {
  const a = G.ask;
  if (!a) return "";
  if (a.kind === "play") {
    if (!U.sel) {
      const flips = a.options.filter((o) => o.type === "flip");
      return `<div class="prompt">${esc(a.text)}</div><div class="acts">${flips.length ? flips.map((o) => btn("Flip the card", "answer", o.id, "grow", `Pay 1${ICON[o.res]}`)).join("") : '<div class="hint">Tap a card to choose it. Tap it again to look closer.</div>'}</div>`;
    }
    const mine = a.options.filter((o) => o.card === U.sel);
    const c = CARDS[U.sel];
    let extra = "";
    if (!mine.some((o) => o.type === "act" || o.type === "edict")) {
      const why = whyNot(G, U.sel);
      extra = btn(c.kind === "mon" ? "Monument" : c.kind === "str" ? "Build" : c.kind === "conq" ? "Conquer" : "Action", "", "", "grow", esc(why), true);
    }
    return `<div class="prompt">${esc(c.name)}</div><div class="acts">${mine.map(playLabel).join("")}${extra}</div>`;
  }
  const o = a.options;
  let body = "";
  if (a.kind === "gainAs") body = o.map((x) => btn(icons(x.gain, "+"), "answer", x.id, "grow")).join("");
  else if (a.kind === "pay") body = o.map((x) => btn(icons(x.pay, "−"), "answer", x.id, "grow")).join("");
  else if (a.kind === "also") body = o.map((x) => btn(esc(CARDS[x.card].name), "answer", x.id, "grow", icons(CARDS[x.card].gain, "+"))).join("");
  else if (a.kind === "treason") body = o.map((x) => (x.id === "keep" ? btn("Keep the card", "answer", x.id, "grow") : btn(`Remove it`, "answer", x.id, "grow danger", `+1${ICON[x.res]} more`))).join("");
  else if (a.kind === "yesno") body = btn("Yes", "answer", "yes", "gold grow") + btn("No", "answer", "no", "grow");
  else if (a.kind === "bribe") body = o.map((x) => (x.id === "no" ? btn("No", "answer", "no", "grow") : btn("Add a cube", "answer", x.id, "gold grow", `Pay ${icons(x.pay)}`))).join("");
  else if (a.kind === "invasion") {
    const fatal = (SCENARIOS[G.setup.scenario] || {}).rule === "lastBastion" || G.locs.length - 1 < a.lose;
    body = o.map((x) => (x.id === "lose" ? btn(`Lose ${a.lose} location${a.lose > 1 ? "s" : ""}`, "answer", "lose", "grow danger", fatal ? "This loses the game" : "") : btn("Repel", "answer", x.id, "gold grow", `Pay ${icons(x.pay)}`))).join("");
  } else if (a.kind === "waste") body = o.map((x) => btn(`Keep ${RES_NAME[x.keep]}`, "answer", x.id, "grow", `${icons({ S: 0, I: 0, M: 0, [x.keep]: G.res[x.keep] || 0 })} stays`)).join("");
  else if (a.kind === "location" || a.kind === "loseLocation") body = '<div class="hint">Tap a glowing location on the map.</div>';
  else if (a.kind === "monument" || a.kind === "unbuild") body = '<div class="hint">Tap a monument.</div>';
  else if (a.kind === "order") {
    const left = a.options.length - U.order.length;
    body = btn("Rest at random", "orderrandom", "", "grow", `${left} left`, !left) + btn("Done", "orderdone", "", "gold grow", "", left > 0);
  }
  return `<div class="prompt">${esc(a.text)}</div><div class="acts">${body}</div>`;
}
function orderView() {
  return `<div class="order">${G.ask.options.map((o) => { const n = U.order.indexOf(o.id); return `<button class="ocard ${n >= 0 ? "sel" : ""}" data-act="order" data-id="${o.id}">${cardImg(o.id)}${n >= 0 ? `<b>${n + 1}</b>` : ""}</button>`; }).join("")}</div>`;
}
function gameScreen() {
  const a = G.ask || {};
  if (G.over) return endScreen();
  const bigMap = a.kind === "location" || a.kind === "loseLocation";
  const pickMon = a.kind === "monument" || a.kind === "unbuild";
  const canUndo = undo && undo !== G && JSON.stringify(undo) !== JSON.stringify(G);
  let mid;
  if (a.kind === "order") mid = orderView();
  else if (a.kind === "invasion") mid = `<div class="invade"><img src="img/act${a.act}.webp" alt="" draggable="false"></div>`;
  else mid = `<div class="table">${bigMap ? mapView(true) : `<div class="boards">${mapView(false)}${monView(pickMon)}</div>`}${chips()}</div>${handView()}`;
  return `<div class="page game">
    <header class="bar top">
      <button class="iconbtn" data-act="sheet" data-id="menu" aria-label="menu">☰</button>
      <span class="stat"><small>Act</small>${roman(G.round)}</span>
      <button class="stat" data-act="sheet" data-id="piles"><small>Deck</small>${G.deck.length}</button>
      <button class="stat" data-act="sheet" data-id="piles"><small>Discard</small>${G.discard.length}</button>
      <button class="stat vp" data-act="sheet" data-id="score"><small>Score</small>${score(G).total}</button>
      <button class="iconbtn" data-act="undo" ${canUndo ? "" : "disabled"} aria-label="undo">↶</button>
    </header>
    <div class="res">${RES.map((r) => `<div class="r ${r}">${ICON[r]}<b>${G.res[r]}</b><small>${RES_NAME[r]}</small></div>`).join("")}</div>
    <main class="mid">${mid}</main>
    <footer class="foot">${coachHtml()}${actionBar()}</footer>
  </div>`;
}
function scoreLines(r) {
  return `<div class="lines">${r.lines.map(([l, v]) => `<div><span>${esc(l)}</span><b>${v > 0 ? "+" : ""}${v}</b></div>`).join("")}<div class="tot"><span>Total</span><b>${vp(r.total)}</b></div></div>`;
}
function endScreen() {
  const r = result(G);
  const sid = G.setup.scenario;
  let head, more = "", foot;
  if (sid) {
    const sc = SCENARIOS[sid];
    head = `<h2 class="${r.won ? "good" : "bad"}">${r.won ? "Victory" : "Defeat"}</h2><p>${sc.stage} ${esc(sc.title)} · goal ${r.goal} VP (${DIFFICULTY[G.setup.difficulty]})</p>`;
    more = `<button class="scard" data-act="zoomimg" data-id="img/s/${sid}-back.webp"><img src="img/s/${sid}-back.webp" alt="" draggable="false"></button>`;
    foot = btn("Continue the campaign", "campaign", sc.campaign, "gold wide");
  } else {
    head = r.lost ? `<h2 class="bad">Rome has fallen</h2>` : `<h2>${esc(r.rank)}</h2><p>Your rank among the ancestral Emperors</p>`;
    foot = btn("New game", "setup", "", "gold grow") + btn("Title", "home", "", "grow");
  }
  return `<div class="page end"><div class="scroll"><div class="endhead">${head}${r.lost ? `<p class="bad">${esc(r.reason)}</p>` : ""}</div>${scoreLines(r)}${more}
    <div class="note">${G.log.slice(-6).map(esc).join("<br>")}</div></div><footer class="foot"><div class="acts">${foot}</div></footer></div>`;
}

// ---------- sheets ----------
const RULES = `
<h3>The game</h3>
<p>New to the game? The <b>Guided tutorial</b> on the title screen coaches you through the first round.</p>
<p>Three rounds (Acts). Each turn you draw 3 cards, play <b>one</b> of them for its Resources (top left of the card) or for its Action (bottom of the card), then discard all three. When the deck is empty at the start of a turn the round ends with an Invasion, then the discard pile is shuffled into a new deck.</p>
<h3>Actions</h3>
<p><b>Monument</b>: pay the cost to add a cube to that monument. Two cubes complete it; a completed monument scores and may give an ability.<br>
<b>Conquer</b>: pay Military equal to the cubes you have on the map, add a cube to a location and gain 1 of its resource.<br>
<b>Call for Tribute</b>: gain 1 of the shown resource per location you control (Rome counts).<br>
<b>Build</b>: pay the cost. The structure stays in play for good: 2 VP, or +2 of a resource every time you gain that resource.</p>
<h3>Invasions</h3>
<p>Act I: pay 2 Military or lose 1 location. Act II: pay 3 or lose 1. Act III: pay 5 or lose 2. If you must lose Rome, you lose the game.</p>
<h3>Scoring</h3>
<p>1 VP per controlled location, plus your structures and completed monuments. 16+ makes you Augustus.</p>
<h3>Rulings in this app</h3>
<p>Resources stop at 9. A structure's +2 applies once per gain (a card, a tribute, a conquered location). A completed monument's cards can no longer be played for their Action. With RSS Mars 1 (basic) the invasion is ignored automatically. Locations lost to an invasion are your choice; Rome goes last. See the README for the full list.</p>`;

function sheetBody(id) {
  if (id === "rules") return `<h2>How to play</h2><div class="prose">${RULES}</div>`;
  if (id === "menu") return `<h2>Astra Imperium</h2><div class="stack">
    ${btn("Score so far", "sheet", "score", "wide")}${btn("Deck and discard pile", "sheet", "piles", "wide")}${btn("Log", "sheet", "log", "wide")}${btn("How to play", "sheet", "rules", "wide")}
    ${btn("Save and go to title", "home", "", "wide")}${btn("Abandon this game", "abandon", "", "wide danger")}</div><div class="ver">version ${VERSION}</div>`;
  if (id === "score") return `<h2>Score so far</h2>${scoreLines(score(G))}${G.setup.scenario ? `<div class="note">Goal: ${SCENARIOS[G.setup.scenario].goals[G.setup.difficulty]} VP</div>` : ""}`;
  if (id === "log") return `<h2>Log</h2><div class="note log">${G.log.slice().reverse().map(esc).join("<br>") || "Nothing yet."}</div>`;
  if (id === "piles") {
    const list = (ids) => (ids.length ? `<div class="thumbs">${ids.map((c) => `<button class="ocard" data-act="zoom" data-id="${c}">${cardImg(c)}</button>`).join("")}</div>` : '<div class="note">Empty.</div>');
    return `<h2>Discard pile (${G.discard.length})</h2>${list(G.discard)}<h2>Deck (${G.deck.length})</h2><div class="note">Face down. Cards not yet seen this round, in alphabetical order:</div>${list([...G.deck, ...(G.faceDown ? [G.faceDown] : [])].sort())}
      ${G.removed.length ? `<h2>Removed from the game</h2>${list(G.removed)}` : ""}`;
  }
  if (id === "map") return `<h2>${MAPS[G.setup.map].name}</h2>${mapView(true)}<div class="note">You control ${G.locs.length} location${G.locs.length === 1 ? "" : "s"}. The next conquest costs ${conquestCost(G)}${ICON.M}.</div>`;
  if (id === "invader") return `<h2>Invasions</h2><div class="invade tall"><img src="img/invader.webp" alt="" draggable="false"></div>`;
  if (id === "leader") { const L = LEADERS[G.setup.leader]; return `<h2>${L.name}</h2><div class="zoom"><img src="img/l/${G.setup.leader}.webp" alt="" draggable="false"></div><div class="note"><b class="good">+</b> ${esc(L.plus)}<br><b class="bad">−</b> ${esc(L.minus)}</div>`; }
  if (id === "scenario") { const sc = SCENARIOS[G.setup.scenario]; return `<h2>${sc.stage} ${esc(sc.title)}</h2><div class="zoom"><img src="img/s/${sc.id}.webp" alt="" draggable="false"></div><div class="note">${esc(sc.text)}</div>`; }
  if (id.startsWith("mon:")) {
    const k = id.slice(4), t = G.setup.tiles[k];
    return `<h2>${MON_NAME[k]}</h2><div class="zoom tile"><img src="img/t/${k}_${t}.webp" alt="" draggable="false"></div>
      <div class="note"><b>${G.mon[k]} of 2 cubes${G.mon[k] === 2 ? " · complete" : ""}.</b> ${esc(TILE_TEXT[k][t])}${G.mon[k] === 2 ? `<br>Worth ${tileVP(G, k)} VP right now.` : ""}</div>`;
  }
  if (id.startsWith("zoom:")) return `<div class="zoom"><img src="img/c/${id.slice(5)}.webp" alt="" draggable="false"></div>`;
  if (id.startsWith("img:")) return `<div class="zoom"><img src="${esc(id.slice(4))}" alt="" draggable="false"></div>`;
  return "";
}
function renderSheet() {
  $sheet.innerHTML = U.sheet ? `<div class="shade" data-act="close"></div><div class="panel"><button class="x" data-act="close" aria-label="close">×</button>${sheetBody(U.sheet)}</div>` : "";
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function render() {
  $app.innerHTML = { home, setup: setupScreen, campaign: campaignScreen, game: gameScreen }[U.screen]();
  renderSheet();
  coachMarks();
}

// ---------- input ----------
const ACTIONS = {
  home() { U.screen = "home"; U.sheet = null; },
  tutorial() {
    if (load() && !G.over && !confirm("Start the tutorial? It replaces your game in progress.")) return;
    startGame({ ...TUTORIAL_SETUP }, TUTORIAL_SEED);
    return true;
  },
  tutnext() { U.tp++; },
  tutback() { U.tp = Math.max(0, U.tp - 1); },
  tutend() { G.tut = null; U.tp = 0; },
  continue() { if (load()) U.screen = "game"; },
  setup() { U.screen = "setup"; },
  campaign(id) { U.camp = id; U.screen = "campaign"; U.sheet = null; },
  map(id) { prefs.map = id; },
  leader(id) { prefs.leader = id || null; },
  tilemode(id) { prefs.tiles = id; },
  tilecycle(id) { prefs.custom[id] = ((prefs.custom[id] || 0) + 1) % 3; },
  diff(id) { U.diff = +id; },
  start() { startGame({ map: prefs.map, leader: prefs.leader }); return true; },
  campstart(id) { camp[id] = { difficulty: U.diff ?? 1, scenario: CAMPAIGNS[id].first, history: [], final: null }; },
  campreset(id) { if (confirm("Reset this campaign?")) { delete camp[id]; if (G && G.setup.scenario && SCENARIOS[G.setup.scenario].campaign === id) G = null; } },
  campplay(id) { const c = camp[id]; startGame({ map: CAMPAIGNS[id].map, leader: prefs.leader, scenario: c.scenario, difficulty: c.difficulty }); return true; },
  card(id) {
    if (!G.ask || G.ask.kind !== "play") { U.sheet = "zoom:" + id; return; }
    if (U.sel === id) U.sheet = "zoom:" + id; else U.sel = id;
  },
  facedown() { U.sel = null; },
  answer(id) { U.sheet = null; answer(id); return true; },
  order(id) { const i = U.order.indexOf(id); if (i >= 0) U.order.splice(i, 1); else U.order.push(id); },
  orderrandom() { const rest = G.ask.options.map((o) => o.id).filter((x) => !U.order.includes(x)); while (rest.length) U.order.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]); },
  orderdone() { answer([...U.order]); return true; },
  undo() { if (undo) { G = undo; U.sel = null; U.order = []; U.tp = 0; } },
  sheet(id) { U.sheet = id; },
  zoom(id) { U.sheet = "zoom:" + id; },
  zoomimg(id) { U.sheet = "img:" + id; },
  close() { U.sheet = null; },
  abandon() { if (confirm("Abandon this game?")) { G = null; undo = null; U.screen = "home"; U.sheet = null; } },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled || !el.dataset.act) return;
  const done = ACTIONS[el.dataset.act](el.dataset.id);
  if (!done) { save(); render(); }
});

// ---------- start ----------
const q = new URLSearchParams(location.search);
if (q.has("tutorial")) {
  // development: ?tutorial=1&follow=N plays the first N scripted steps, &tp=K (or last) opens page K
  G = newGame({ ...TUTORIAL_SETUP }, TUTORIAL_SEED);
  G.tut = 0;
  for (let i = 0; i < +(q.get("follow") || 0); i++) { const w = SCRIPT[i].want; const t = scriptNext(G, w); G = act(G, w); G.tut = t; }
  undo = G;
  U.screen = "game";
  const st = scriptStep(G);
  if (q.has("tp") && st) U.tp = q.get("tp") === "last" ? st.pages.length - 1 : +q.get("tp");
  if (q.has("sel")) U.sel = G.hand[+q.get("sel")];
} else if (q.has("new")) {
  // development: ?new={"leader":"kallax"}&seed=3&auto=40&bot=greedy&until=invasion&sel=0&sheet=menu&click=sel;sel
  G = newGame(JSON.parse(q.get("new") || "{}"), +(q.get("seed") || 1));
  undo = G;
  U.screen = "game";
  const n = +(q.get("auto") || 0);
  if (n) {
    const h = await import("../tests/helpers.mjs");
    const r = h.rng(+(q.get("seed") || 1));
    const stepFn = q.get("bot") === "random" ? h.step : h.greedyStep;
    for (let i = 0; i < n && !G.over; i++) G = stepFn(G, r);
    for (let i = 0; i < 300 && q.get("until") && !G.over && G.ask.kind !== q.get("until"); i++) G = stepFn(G, r);
    undo = G;
  }
  if (q.has("sel")) U.sel = G.hand[+q.get("sel")];
} else if (q.has("screen")) {
  U.screen = q.get("screen");
  if (q.has("camp")) U.camp = q.get("camp");
  if (q.has("campstate")) camp = JSON.parse(q.get("campstate"));
  if (q.has("prefs")) prefs = { ...prefs, ...JSON.parse(q.get("prefs")) };
}
if (q.has("sheet")) U.sheet = q.get("sheet");
render();
if (q.has("click")) for (const sel of q.get("click").split(";")) { const n = document.querySelector(sel); if (n) n.click(); else console.warn("no " + sel); }

if ("serviceWorker" in navigator && location.protocol === "https:") {
  // Show a new version as soon as it has taken over, instead of on the load after next.
  const had = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (had && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => reg.update()).catch(() => {});
}
