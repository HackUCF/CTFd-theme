// Run with: node --test test/
import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_KEY,
  ORIGINALS_KEY,
  buildEvents,
  enrich,
  filterChallenges,
  groupChallenges,
  normalizeSettings,
  parseAliases,
  parseDifficulty,
  sortChallenges,
} from "../assets/js/archive/model.js";

const settings = normalizeSettings({ category_aliases: "RE = Reversing" });

const raw = [
  {
    id: 1,
    name: "Notetorious",
    category: "Pwn",
    value: 500,
    solves: 3,
    solved_by_me: true,
    tags: [{ value: "2017" }],
  },
  {
    id: 2,
    name: "BASEic",
    category: "RE",
    value: 480,
    solves: 10,
    solved_by_me: false,
    tags: [{ value: "2025" }, { value: "difficulty:easy" }],
  },
  {
    id: 3,
    name: "Intro Heap",
    category: "Pwn",
    value: 100,
    solves: 0,
    solved_by_me: false,
    tags: [{ value: "heap" }, { value: "difficulty:2" }],
  },
  {
    id: 4,
    name: "Bonus",
    category: "Misc",
    value: 50,
    solves: null,
    solved_by_me: false,
    type: "hidden",
    tags: [{ value: "event:Hack@UCF Workshop" }],
  },
  {
    id: 5,
    name: "zebra",
    category: "Web",
    value: 500,
    solves: 1,
    solved_by_me: false,
    tags: [{ value: "2025" }, { value: "difficulty:insane" }],
  },
];
const chals = raw.map(c => enrich(c, settings));

test("settings and parsing", () => {
  assert.deepEqual(parseAliases("RE = Reversing\nbad line\n"), { RE: "Reversing" });
  assert.deepEqual(parseAliases('{"A": "B"}'), { A: "B" });
  assert.equal(
    normalizeSettings({ originals_position: "bogus" }).originals_position,
    "last",
  );
  assert.equal(parseDifficulty("HARD").level, 4);
  assert.equal(parseDifficulty("5").key, "insane");
  assert.equal(parseDifficulty("expert").key, "insane");
  assert.equal(parseDifficulty("7"), null);
});

test("enrich derives event, difficulty, category alias, display tags", () => {
  assert.equal(chals[0].eventKey, "2017");
  assert.equal(chals[0].eventLabel, "SunshineCTF 2017");
  assert.equal(chals[1].category, "Reversing");
  assert.equal(chals[1].difficulty.key, "easy");
  assert.equal(chals[2].eventKey, ORIGINALS_KEY);
  assert.equal(chals[2].eventLabel, "Hack@UCF Originals");
  assert.deepEqual(chals[2].displayTags, ["heap"]);
  assert.equal(chals[3].eventLabel, "Hack@UCF Workshop");
  assert.equal(chals[3].locked, true);
});

test("events are ordered newest first with originals last", () => {
  const events = buildEvents(chals, settings);
  assert.deepEqual(
    events.map(e => e.key),
    ["2025", "2017", "event:hack@ucf workshop", ORIGINALS_KEY],
  );
  assert.equal(events[1].solved, 1);
  const first = buildEvents(
    chals,
    normalizeSettings({ originals_position: "first", event_order: "oldest" }),
  );
  assert.deepEqual(
    first.map(e => e.key),
    [ORIGINALS_KEY, "2017", "2025", "event:hack@ucf workshop"],
  );
});

test("filtering", () => {
  const base = {
    event: ALL_KEY,
    q: "",
    categories: [],
    difficulties: [],
    status: "all",
  };
  const ids = f => filterChallenges(chals, { ...base, ...f }).map(c => c.id);
  assert.deepEqual(ids({ event: "2025" }), [2, 5]);
  assert.deepEqual(ids({ categories: ["Pwn"] }), [1, 3]);
  assert.deepEqual(ids({ difficulties: [0] }), [1, 4]);
  assert.deepEqual(ids({ status: "solved" }), [1]);
  assert.deepEqual(ids({ q: "sunshinectf rev" }), [2]);
  assert.deepEqual(ids({ q: "heap" }), [3]);
  assert.deepEqual(
    filterChallenges(
      chals,
      { ...base, event: "2025", categories: ["Pwn"] },
      { skip: "category" },
    ).map(c => c.id),
    [2, 5],
  );
});

test("sorting is stable and puts nulls last", () => {
  assert.deepEqual(
    sortChallenges(chals, "solves-desc").map(c => c.id),
    [2, 1, 5, 3, 4],
  );
  assert.deepEqual(
    sortChallenges(chals, "solves-asc").map(c => c.id),
    [3, 5, 1, 2, 4],
  );
  assert.deepEqual(
    sortChallenges(chals, "difficulty-asc").map(c => c.id),
    [2, 3, 5, 1, 4],
  );
  assert.deepEqual(
    sortChallenges(chals, "name").map(c => c.name),
    ["BASEic", "Bonus", "Intro Heap", "Notetorious", "zebra"],
  );
  assert.deepEqual(
    sortChallenges(chals, "default").map(c => c.id),
    [1, 2, 3, 4, 5],
  );
});

test("grouping", () => {
  const events = buildEvents(chals, settings);
  const byEvent = groupChallenges(chals, "event", { events });
  assert.deepEqual(
    byEvent.map(g => g.key),
    ["2025", "2017", "event:hack@ucf workshop", ORIGINALS_KEY],
  );
  const byDiff = groupChallenges(chals, "difficulty");
  assert.deepEqual(
    byDiff.map(g => g.label),
    ["Easy", "Insane", "Unrated"],
  );
  assert.equal(groupChallenges(chals, "none")[0].challenges.length, 5);
});
