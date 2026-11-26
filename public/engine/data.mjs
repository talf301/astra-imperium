// Game data, transcribed from the printed faces (Letter print-and-play sheets).
// Resources: S = Science (gear), I = Industry (crystal), M = Military (flag).

export const RES = ["S", "I", "M"];
export const RES_NAME = { S: "Science", I: "Industry", M: "Military" };
export const MAX_RES = 9;

// id | name | kind | gain | cost | extra
// kind: mon (extra = monument key), str (extra = bonus resource, or "vp"), conq, trib (extra = resource), edict
const CARD_TABLE = `
nova_a     | Novastage           | mon   | SS   | III | nova
nova_b     | Novastage           | mon   | IS   | SSS | nova
qb_a       | Quantum Barterdeck  | mon   | IM   | SSS | qb
qb_b       | Quantum Barterdeck  | mon   | II   | IIS | qb
urbis_a    | Orbit Urbis         | mon   | IM   | SSS | urbis
urbis_b    | Orbit Urbis         | mon   | II   | IIM | urbis
vault_a    | Datavault           | mon   | SS   | ISS | vault
vault_b    | Datavault           | mon   | SI   | SSS | vault
flux_a     | Orbital Fluxway     | mon   | MM   | IIM | flux
flux_b     | Orbital Fluxway     | mon   | SM   | SSS | flux
mars_a     | RSS Mars 1          | mon   | IM   | SSS | mars
mars_b     | RSS Mars 1          | mon   | MM   | IIM | mars
training   | Training Facility   | str   | MMS  | IIM | M
lab        | Research Laboratory | str   | ISS  | IIS | S
mining     | Mining Colony       | str   | III  | III | I
harvester  | Solar Harvester     | str   | IMS  | IIS | vp
holo       | Holo-Muse           | str   | IMS  | IIS | vp
conquest_a | Conquest            | conq  | IS   |     |
conquest_b | Conquest            | conq  | II   |     |
tribute_s  | Call for Tribute    | trib  | II   |     | S
tribute_i  | Call for Tribute    | trib  | IS   |     | I
edict      | Edict of Kallax Calla | edict | IISS | M |
`;

export const vec = (str) => {
  const v = { S: 0, I: 0, M: 0 };
  for (const ch of str || "") v[ch]++;
  return v;
};

export const CARDS = {};
for (const line of CARD_TABLE.trim().split("\n")) {
  const [id, name, kind, gain, cost, extra] = line.split("|").map((x) => x.trim());
  const c = { id, name, kind, gain: vec(gain), gainStr: gain, cost: vec(cost), costStr: cost };
  if (kind === "mon") c.mon = extra;
  if (kind === "str") { if (extra === "vp") c.vp = 2; else c.bonus = extra; }
  if (kind === "trib") c.trib = extra;
  CARDS[id] = c;
}
export const BASE_DECK = Object.keys(CARDS).filter((id) => id !== "edict");
export const STRUCTURES = BASE_DECK.filter((id) => CARDS[id].kind === "str");

// Monuments. Board layout (upright): nova qb / urbis vault / flux mars.
export const MONUMENTS = ["nova", "qb", "urbis", "vault", "flux", "mars"];
export const MON_NAME = { nova: "Novastage", qb: "Quantum Barterdeck", urbis: "Orbit Urbis", vault: "Data Vault", flux: "Orbital Fluxway", mars: "RSS Mars 1" };
export const VAULT_ADJACENT = ["qb", "urbis", "mars"];
// Text of each tile: [basic, variant I, variant II].
export const TILE_TEXT = {
  nova: [
    "2 VP. Science and Military are interchangeable: whenever you gain or spend one, you may gain or spend the other instead.",
    "When you choose to gain Resources from a card, also gain the Resources from another card in your hand that turn.",
    "3 VP. Science and Industry are interchangeable: whenever you gain or spend one, you may gain or spend the other instead.",
  ],
  urbis: [
    "1 VP for each built Structure you have at the end of the game.",
    "5 VP minus 1 for each built Structure you have at the end of the game.",
    "1 VP + the VP value of each of your built Structures (an additional time).",
  ],
  qb: [
    "VP equal to the Resource you have the LEAST of at the end of the game.",
    "1 VP for each set of 3 Resources of one type (7 Industry earns 2 VP).",
    "3 VP for each Resource that you have exactly 0 of at the end of the game.",
  ],
  vault: [
    "4 VP at the end of the game.",
    "2 VP for every 3 Control Cubes you have on Monuments at game end.",
    "2 VP for each completed Monument orthogonally adjacent to the Data Vault (Quantum Barterdeck, Orbit Urbis, RSS Mars 1).",
  ],
  flux: [
    "1 VP for each location you control at game end (in addition to the VP they normally give).",
    "4 VP provided Rome is the only location you control at the end of the game.",
    "3 VP. When you gain control of a location, gain 2 Resources of your choice instead of just the one shown.",
  ],
  mars: [
    "2 VP. Ignore invasions at the end of each round (you lose no Military, nor control of locations).",
    "3 VP. During Invasions you may pay any one type of Resource to cover the Invasion's cost.",
    "1 VP. After each Invasion, take a free Conquest action, adding a Control Cube to a location at no cost.",
  ],
};

// Map mats. Locations 1..6; location 0 is Rome. Coordinates are fractions of the (landscape) mat image.
export const MAPS = {
  earth: {
    name: "Earth 2255", rome: [0.512, 0.44],
    locs: [["I", 0.344, 0.144], ["S", 0.156, 0.407], ["S", 0.806, 0.283], ["S", 0.7, 0.444], ["I", 0.3, 0.64], ["I", 0.866, 0.741]],
  },
  galaxia: {
    name: "Galaxia Nova (A)", rome: [0.5, 0.5],
    locs: [["I", 0.244, 0.198], ["S", 0.7, 0.24], ["I", 0.125, 0.49], ["I", 0.9, 0.48], ["S", 0.215, 0.753], ["S", 0.79, 0.757]],
  },
  constantius: {
    name: "Constantius (A)", rome: [0.315, 0.48],
    locs: [["I", 0.885, 0.545], ["S", 0.41, 0.64], ["S", 0.155, 0.7], ["S", 0.536, 0.31], ["I", 0.747, 0.21], ["I", 0.21, 0.24]],
  },
};

// Invader board: Military cost, and locations lost otherwise.
export const INVASIONS = [null, { cost: 2, lose: 1 }, { cost: 3, lose: 1 }, { cost: 5, lose: 2 }];

export const LEADERS = {
  calculigula: { name: "Calculigula", plus: "Ludicrous Ideas: each monument with only 1 cube grants 2 VP.", minus: "Wasted Resources: after the first and second enemy invasions, choose 2 resource types to set to 0." },
  commodorus: { name: "Commodorus", plus: "Hercules: whenever a resource type is on 0 at the beginning of your turn, gain 1 resource of this type.", minus: "Plague: you cannot build structures. At the start of your game, put all structure cards in the discard pile." },
  starjan: { name: "Starjan", plus: "Expansionism: each controlled location grants 1 additional VP.", minus: "Uprisings: each conquest costs 2 additional Military." },
  kallax: { name: "Kallax Calla", plus: "Edict of Kallax Calla: add the special action card, Edict of Kallax Calla, to the deck.", minus: "Cruel Leader: lose 2 VP at the end of the game." },
  voidspasian: { name: "Voidspasian", plus: "Monument Builder: each monument grants 1 additional VP.", minus: "Rome in Ashes: start the game with all resources set to 0." },
  cyberius: { name: "Cyberius", plus: "Treason Trials: when you play an action card to gain resources, you may remove the card from the game to gain +1 of its resources.", minus: "From Capri: the third card you draw each turn stays face down. You can flip it face up by paying 1 resource." },
};

export const RANKS = [[16, "Augustus"], [14, "Julius Caesar"], [12, "Marcus Aurelius"], [10, "Tiberius"], [-99, "Nero"]];

// Scenario cards. goals = [easy, normal, hard]. win / lose: next scenario id, or a final result.
// id | stage | title | goals | win | lose | rule key | special rules text
const SCEN_TABLE = `
1.1e  | I.I   | Emperor  | 11 13 15 | 1.2e | 1.2d | none | No special rules.
1.2e  | I.II  | Emperor  | 13 15 17 | 1.3e | 1.3d | patricians | When you build a structure, you may pay 2 Industry to add a cube to this card. Earn 1 VP per cube.
1.2d  | I.II  | Dictator | 13 15 17 | 1.3e | 1.3t | extraRes | Start the game with one extra resource of each type.
1.3e  | I.III | Emperor  | 15 17 19 | 1.4e | 1.4d | repel | Each invasion repelled by paying Military yields 1 VP. If all are repelled, gain an additional VP.
1.3d  | I.III | Dictator | 15 17 19 | 1.4e | 1.4t | freeMonument | Start the game with a monument of your choice already completed.
1.3t  | I.III | Tyrant   | 15 17 19 | 1.4d | 1.4t | mining | Start the game with the Mining Colony already built.
1.4e  | I.IV  | Emperor  | 17 19 21 | =Overwhelming Victory | =Narrow Defeat | sortDeck | Before starting the game, sort the cards in the deck into the order of your choice.
1.4d  | I.IV  | Dictator | 17 19 21 | =Victory | =Defeat | monPlus2 | Each completed monument yields 2 additional VP at the end of the game.
1.4t  | I.IV  | Tyrant   | 17 19 21 | =Narrow Victory | =Overwhelming Defeat | lastBastion | Each location yields 2 VP instead of 1 at the end of the game. If you lose a location, you lose the game.
2.1   | II.I  | Crisis   | 14 16 18 | 2.2l | 2.2i | crisis | Start with 3 controlled locations of your choice. Each invasion is resolved twice. The RSS Mars 1 cancels only 1 of the 2 invasions.
2.2l  | II.II | Ludem et Circenses | 12 14 16 | 2.3pl | 2.3po | circus | When you play an RSS Mars 1 card, instead of building it, you may pay 3 resources (any combination) to add 1 cube to this card. -2 VP if no cubes on this card; +2 VP if at least 2 cubes.
2.2i  | II.II | Inflation | 12 14 16 | 2.3pl | =Overwhelming Defeat | inflation | Before each invasion, pay 2 resources of your choice for each built structure. You lose if you can't. The RSS Mars 1 can't cancel this effect.
2.3pl | II.III | Plunder of the Capital | 10 12 14 | 2.4d | 2.4c | plunder | During each invasion, remove a cube from a monument. This effect can't be cancelled by the RSS Mars 1. If you can't remove a cube, you lose.
2.3po | II.III | Poverty | 10 12 14 | 2.4d | =Defeat | poverty | Before setup, randomly choose 2 action cards and return them to the box (you may look at them).
2.4d  | II.IV | Decay    | 8 10 12  | =Victory | 2.4c | decay | Each monument is worth 2 less VP.
2.4c  | II.IV | Corruption | 8 10 12 | =Narrow Victory | =Narrow Defeat | corruption | When you play a Call for Tribute card, you may also pay 2 Science or 1 Military to add a cube to this card. If this card has fewer than 3 cubes at game end, you lose.
`;
export const SCENARIOS = {};
for (const line of SCEN_TABLE.trim().split("\n")) {
  const [id, stage, title, goals, win, lose, rule, text] = line.split("|").map((x) => x.trim());
  SCENARIOS[id] = { id, stage, title, goals: goals.split(" ").map(Number), win, lose, rule, text, campaign: id[0] === "1" ? "c1" : "c2" };
}
export const CAMPAIGNS = {
  c1: { name: "Rise of the Empire", num: "I", first: "1.1e", map: "earth", blurb: "Four stages of branching scenarios: can you attain victory as a Tyrant, a Dictator, or a venerable Emperor?" },
  c2: { name: "Fall of the Empire", num: "II", first: "2.1", map: "earth", blurb: "Crises threaten our very existence. With each stage VP requirements get easier, but circumstances get harder." },
};
export const DIFFICULTY = ["Easy", "Normal", "Hard"];
