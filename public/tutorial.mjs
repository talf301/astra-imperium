// Guided tutorial.
// It is an ordinary standard game with a fixed seed, so the same cards come up every time. SCRIPT[i] coaches the
// i-th decision and names the answer (`want`, an option id) that keeps the lesson on its path. A player who answers
// differently leaves the script and simply plays on. tests/tutorial.test.mjs replays the script against the engine,
// so a rules change cannot silently break the lesson.
// Text may use {S} {I} {M} {VP} icon tokens and **bold**. `focus` is a CSS selector to point at.

export const TUTORIAL_SETUP = { map: "earth", leader: null, tiles: {} };
export const TUTORIAL_SEED = 7;

export const SCRIPT = [
  { at: "play", want: "gain:lab", pages: [
    { text: "Welcome, Emperor. You have **3 rounds** (Acts) to lead Rome to glory. I will walk you through the first round, then leave you to it." },
    { text: "These are your resources: {S} **Science**, {I} **Industry** and {M} **Military**. You start with 1 of each and can hold up to 9.", focus: ".res" },
    { text: "The **map**. The white cube is Rome, the one location you control. Every location you control is worth 1 {VP} at the end.", focus: ".map" },
    { text: "The six **monuments**. Each needs 2 cubes to be completed. Completed monuments score {VP} and some give you an ability. Tap one any time to read it.", focus: ".mons" },
    { text: "Each turn you draw **3 cards** and play **one**: either for its **Resources** (top left of the card) or for its **Action** (bottom of the card). The other two are discarded.", focus: ".hand" },
    { text: "You cannot afford much yet. Tap **Research Laboratory**, then **Resources** to gain 1 {I} and 2 {S}.", focus: ".hand" }] },
  { at: "play", want: "act:mars_a", pages: [
    { text: "Now you hold 3 {S}. This **RSS Mars 1** card shows a cost of 3 {S} at the bottom: its Action adds a cube to the RSS Mars 1 monument." },
    { text: "RSS Mars 1, once complete, makes you **ignore invasions**. Tap the right-hand RSS Mars 1 card (it gains {I}{M}), then **Work on monument**.", focus: ".hand" }] },
  { at: "play", want: "gain:flux_b", pages: [
    { text: "One cube is on RSS Mars 1. A second RSS Mars 1 card will complete it.", focus: ".mons" },
    { text: "You have no {S} left, so none of these Actions can be paid for. When that happens you must take Resources. Tap **Orbital Fluxway**, then **Resources**: 1 {S} and 1 {M}.", focus: ".hand" }] },
  { at: "play", want: "act:holo", pages: [
    { text: "**Holo-Muse** is a **structure**. Its Action builds it for 2 {I} and 1 {S}. A built structure stays in play for the whole game and never returns to the deck." },
    { text: "Holo-Muse is worth 2 {VP}. Other structures instead give +2 of a resource every time you gain that resource. Tap **Holo-Muse**, then **Build**.", focus: ".hand" }] },
  { at: "play", want: "gain:harvester", pages: [
    { text: "Holo-Muse is built: your score went up by 2. The score at the top is what you would have if the game ended now.", focus: ".top" },
    { text: "Your {S} and {I} are spent again. Take the three resources from **Solar Harvester**: tap it, then **Resources**.", focus: ".hand" }] },
  { at: "play", want: "gain:training", pages: [
    { text: "The round ends when the deck runs out, and then Rome is **invaded**. This round's invasion costs 2 {M}; if you cannot pay, you lose a location. With only Rome, that loses the game.", focus: ".chips" },
    { text: "So stock up on {M}. Tap **Training Facility**, then **Resources**: 2 {M} and 1 {S}.", focus: ".hand" }] },
  { at: "play", want: "act:conquest_b", pages: [
    { text: "Last hand of the round: the deck is empty. A **Conquest** card lets you take a new location. It costs 1 {M} for each cube you have on the map, so only 1 for now." },
    { text: "Tap **Conquest**, then **Conquer**.", focus: ".hand" }] },
  { at: "location", want: "loc2", pages: [
    { text: "Choose a location. You gain 1 of the resource shown on it, and it is worth 1 {VP} as long as you hold it. Tap the glowing {S} location on the **left** of the map.", focus: ".map" }] },
  { at: "invasion", want: "0,0,2", pages: [
    { text: "The deck is empty, so the round ends with the **Act I invasion**: pay 2 {M} or lose 1 location. Later invasions are harsher: 3 {M} in Act II, and 5 {M} or 2 locations in Act III." },
    { text: "You saved enough. Tap **Repel**." }] },
  { at: "play", pages: [
    { text: "**Act II.** The discard pile was shuffled into a new deck, so you will see every card again. Holo-Muse stays built and is no longer in the deck." },
    { text: "Two cards you have not used yet: **Call for Tribute** gains 1 of a resource for each location you control, Rome included. A second **Conquest** now costs 2 {M}." },
    { text: "After the third invasion you score: 1 {VP} per location, plus your structures and completed monuments. **16 or more makes you Augustus.** The menu (top left) has the rules and the log. Rome is yours." }] },
];

// The step that coaches this state, or null when the game is not (or no longer) on the script.
export function scriptStep(state) {
  if (state.tut == null || !state.ask) return null;
  const step = SCRIPT[state.tut];
  return step && step.at === state.ask.kind ? { ...step, index: state.tut, total: SCRIPT.length } : null;
}
// The script position after answering `id` at this state: the next index, or null when the answer leaves the script.
export function scriptNext(state, id) {
  const step = scriptStep(state);
  return step && step.want === id ? state.tut + 1 : null;
}
