// The tutorial script must stay playable: every step meets the decision it expects and its answer is legal.
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, act, score } from "../public/engine/game.mjs";
import { CARDS } from "../public/engine/data.mjs";
import { TUTORIAL_SETUP, TUTORIAL_SEED, SCRIPT, scriptStep, scriptNext } from "../public/tutorial.mjs";

test("the tutorial script replays against the engine", () => {
  let s = newGame(TUTORIAL_SETUP, TUTORIAL_SEED);
  s.tut = 0;
  const seen = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const step = scriptStep(s);
    assert.ok(step, `step ${i}: expected "${SCRIPT[i].at}", engine asked ${s.ask && s.ask.kind}`);
    assert.equal(step.index, i);
    assert.ok(step.pages.length > 0 && step.pages.every((p) => p.text.length > 0 && p.text.length < 300), `step ${i}: page text missing or too long for a phone`);
    seen.push({ res: { ...s.res }, hand: [...s.hand], score: score(s).total, deck: s.deck.length });
    if (!step.want) { assert.equal(i, SCRIPT.length - 1, "only the last step has no answer"); break; }
    assert.ok(s.ask.options.some((o) => o.id === step.want), `step ${i}: option ${step.want} is not offered`);
    const next = scriptNext(s, step.want);
    s = act(s, step.want);
    s.tut = next;
  }
  // Facts the lesson states.
  assert.deepEqual(seen[0].res, { S: 1, I: 1, M: 1 });
  assert.deepEqual(seen[1].res, { S: 3, I: 2, M: 1 }); // "Now you hold 3 Science"
  assert.equal(seen[1].hand.indexOf("mars_a"), 2); // "the right-hand RSS Mars 1 card"
  assert.equal(CARDS.mars_a.gainStr, "IM");
  assert.equal(seen[2].res.S, 0); // "You have no Science left"
  assert.equal(seen[4].score - seen[3].score, 2); // Holo-Muse
  assert.deepEqual(seen[4].res, { S: 0, I: 0, M: 2 }); // "out of resources again" (but for Military)
  assert.equal(seen[6].deck, 0); // "the deck is empty"
  assert.equal(seen[6].res.M >= 3, true); // conquest (1) and the invasion (2)
  assert.equal(s.round, 2);
  assert.equal(s.mon.mars, 1);
  assert.deepEqual(s.built, ["holo"]);
  assert.deepEqual(s.locs, [0, 2]);
  assert.equal(score(s).total, 4);
});

test("a different answer leaves the script", () => {
  const s = newGame(TUTORIAL_SETUP, TUTORIAL_SEED);
  s.tut = 0;
  assert.equal(scriptNext(s, "gain:conquest_a"), null);
  const t = act(s, "gain:conquest_a");
  assert.equal(t.tut, 0, "the engine carries the field; the app clears it");
  t.tut = null;
  assert.equal(scriptStep(t), null);
});
