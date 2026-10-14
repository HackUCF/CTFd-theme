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
  sortCategories,
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
    tags: [{ value: "sunshinectf-2017" }],
  },
  {
    id: 2,
    name: "BASEic",
    category: "RE",
    value: 480,
    solves: 10,
    solved_by_me: false,
    tags: [{ value: "sunshinectf-2025" }, { value: "Beginner" }],
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
    tags: [
      { value: "sunshinectf-2025" },
      { value: "difficulty:insane" },
      { value: "expert" },
    ],
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
  assert.equal(parseDifficulty("HARD").level, 3);
  assert.equal(parseDifficulty("3").key, "expert");
  assert.equal(parseDifficulty("medium").key, "intermediate");
  assert.equal(parseDifficulty("4"), null);
});

test("enrich derives event, difficulty, category alias, display tags", () => {
  assert.equal(chals[0].eventKey, "2017");
  assert.equal(chals[0].eventLabel, "SunshineCTF 2017");
  assert.equal(chals[1].category, "Reversing");
  assert.equal(chals[1].difficulty.key, "beginner");
  assert.deepEqual(chals[1].displayTags, []);
  assert.equal(chals[2].eventKey, ORIGINALS_KEY);
  assert.equal(chals[2].eventLabel, "Hack@UCF Originals");
  assert.deepEqual(chals[2].displayTags, ["heap"]);
  assert.equal(chals[3].eventLabel, "Hack@UCF Workshop");
  assert.equal(chals[3].locked, true);
  assert.deepEqual(chals[0].displayTags, []);
  const caps = enrich(
    { id: 9, name: "x", tags: ["SunshineCTF-2019", "2018"] },
    settings,
  );
  assert.equal(caps.eventKey, "2019");
  assert.deepEqual(caps.displayTags, ["2018"]);
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
    ["Beginner", "Intermediate", "Expert", "Unrated"],
  );
  assert.equal(groupChallenges(chals, "none")[0].challenges.length, 5);
});

test("enrich pulls speedrun/i95 tags into the shared mini-pwn category", () => {
  const sr = enrich(
    {
      id: 9,
      name: "speedrun-03",
      category: "Pwn",
      tags: ["sunshinectf-2020", "beginner", "speedrun"],
    },
    settings,
  );
  assert.equal(sr.category, "Speedrun/I95 (Mini Pwn)");
  assert.equal(sr.originalCategory, "Pwn");
  assert.deepEqual(sr.displayTags, []); // speedrun/year/difficulty all consumed
  const i95 = enrich(
    {
      id: 10,
      name: "Miami",
      category: "Pwn",
      tags: ["sunshinectf-2025", "beginner", "i95"],
    },
    settings,
  );
  // Both tags land in the same group, so the board shows one mini-pwn column
  assert.equal(i95.category, sr.category);
  assert.equal(i95.originalCategory, "Pwn");
});

test("default category order: Pwn, mini-pwn, RE/Reversing, Web, Crypto, Forensics, Scripting, then rest", () => {
  const cats = [
    "Misc",
    "Web",
    "Pwn",
    "Scripting",
    "Reversing",
    "Forensics",
    "Crypto",
    "Speedrun/I95 (Mini Pwn)",
    "Stego",
  ];
  assert.deepEqual(sortCategories(cats), [
    "Pwn",
    // the mini-pwn category ranks right after Pwn
    "Speedrun/I95 (Mini Pwn)",
    "Reversing",
    "Web",
    "Crypto",
    "Forensics",
    "Scripting",
    // the rest, alphabetical:
    "Misc",
    "Stego",
  ]);
  // "RE" sorts in the same slot as "Reversing" (right after Pwn)
  assert.deepEqual(sortCategories(["Web", "RE", "Pwn"]), ["Pwn", "RE", "Web"]);
});
