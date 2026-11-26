import test from "node:test";
import assert from "node:assert/strict";
import { result } from "../public/engine/game.mjs";
import { SCENARIOS, LEADERS } from "../public/engine/data.mjs";
import { playOut, setupFor, step, greedyStep } from "./helpers.mjs";

const SEEDS = +(process.env.FUZZ_SEEDS || 600);

test(`random play: ${SEEDS} games across every setup keep the invariants`, () => {
  let lost = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let s;
    try { s = playOut(setupFor(seed), seed, step); } catch (e) { e.message = `seed ${seed} ${JSON.stringify(setupFor(seed))}: ${e.message}`; throw e; }
    const r = result(s);
    assert.equal(typeof r.total, "number");
    if (r.lost) lost++;
  }
  assert.ok(lost < SEEDS, "every random game was lost");
});

test("every scenario and every leader plays to the end with random play", () => {
  let seed = 5000;
  for (const scenario of [null, ...Object.keys(SCENARIOS)]) for (const leader of [null, ...Object.keys(LEADERS)]) {
    for (let k = 0; k < 3; k++) {
      seed++;
      try { playOut({ scenario, leader, tiles: setupFor(seed).tiles }, seed, step); } catch (e) { e.message = `seed ${seed} ${scenario} ${leader}: ${e.message}`; throw e; }
    }
  }
});

test("greedy play never loses the standard game and scores respectably", () => {
  let best = 0, sum = 0, n = 30, aug = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = result(playOut({}, seed, greedyStep));
    assert.ok(!r.lost, "greedy lost a standard game, seed " + seed);
    best = Math.max(best, r.total); sum += r.total;
    if (r.total >= 16) aug++;
  }
  console.log(`greedy standard: mean ${(sum / n).toFixed(1)}, best ${best}, Augustus ${aug}/${n}`);
  assert.ok(sum / n >= 9, "greedy mean too low: " + sum / n);
  assert.ok(best >= 12, 'greedy best too low: ' + best);
});

test("greedy play wins some scenarios on Easy", () => {
  const wins = {};
  for (const scenario of Object.keys(SCENARIOS)) {
    wins[scenario] = 0;
    for (let seed = 1; seed <= 12; seed++) if (result(playOut({ scenario, difficulty: 0 }, seed, greedyStep)).won) wins[scenario]++;
  }
  console.log("greedy wins of 12 on Easy:", JSON.stringify(wins));
  assert.ok(Object.values(wins).filter((w) => w > 0).length >= 8, "too few scenarios winnable by the greedy bot");
});
