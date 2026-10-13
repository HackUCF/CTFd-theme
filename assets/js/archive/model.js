// Pure helpers for the archive challenge browser: tag parsing, filtering,
// sorting and grouping. Kept free of DOM/Alpine so it can be unit tested with
// plain node (see test/model.test.mjs).
//
// Tag conventions (all optional):
//   "2017"               event = event_name_template with {year} = 2017
//   "event:<name>"       event = <name> (overrides a year tag for the label)
//   "<level>"            difficulty, where <level> is a key in DIFFICULTIES
//                        ("beginner", "intermediate" or "expert")
//   "difficulty:<level>" the same, also accepting a number 1-3 or an alias
//                        ("easy", "hard", ...)
// A challenge with no year or event tag belongs to the "originals" event.
// Tags consumed by these conventions are hidden from the tag chips.

export const DIFFICULTIES = [
  { level: 1, key: "beginner", label: "Beginner" },
  { level: 2, key: "intermediate", label: "Intermediate" },
  { level: 3, key: "expert", label: "Expert" },
];

const DIFFICULTY_ALIASES = {
  baby: 1,
  intro: 1,
  introductory: 1,
  easy: 1,
  normal: 2,
  medium: 2,
  hard: 3,
  difficult: 3,
  insane: 3,
  extreme: 3,
};

export const ORIGINALS_KEY = "originals";
export const ALL_KEY = "all";

export const DEFAULT_SETTINGS = {
  event_name_template: "SunshineCTF {year}",
  originals_label: "Hack@UCF Originals",
  originals_position: "last",
  event_order: "newest",
  category_aliases: {},
};

const YEAR_RE = /^(19|20)\d\d$/;

function str(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

// Accept the theme settings object CTFd hands us (string values from the
// admin form, or real JSON values if edited by hand) and fill in defaults.
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return s;
  }
  for (const key of ["event_name_template", "originals_label"]) {
    if (str(raw[key])) {
      s[key] = str(raw[key]);
    }
  }
  if (["first", "last"].includes(str(raw.originals_position))) {
    s.originals_position = str(raw.originals_position);
  }
  if (["newest", "oldest"].includes(str(raw.event_order))) {
    s.event_order = str(raw.event_order);
  }
  let aliases = raw.category_aliases;
  if (typeof aliases === "string") {
    aliases = parseAliases(aliases);
  }
  if (aliases && typeof aliases === "object") {
    s.category_aliases = aliases;
  }
  return s;
}

// "RE = Reversing" lines (or a JSON object) -> { RE: "Reversing" }
export function parseAliases(text) {
  text = str(text);
  if (!text) {
    return {};
  }
  if (text.startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return {};
    }
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const from = line.slice(0, idx).trim();
      const to = line.slice(idx + 1).trim();
      if (from && to) {
        out[from] = to;
      }
    }
  }
  return out;
}

export function parseDifficulty(value) {
  const v = str(value).toLowerCase();
  if (!v) {
    return null;
  }
  if (/^[1-3]$/.test(v)) {
    return DIFFICULTIES[Number(v) - 1];
  }
  const found = DIFFICULTIES.find(d => d.key === v);
  if (found) {
    return found;
  }
  if (DIFFICULTY_ALIASES[v]) {
    return DIFFICULTIES[DIFFICULTY_ALIASES[v] - 1];
  }
  return null;
}

function tagValue(tag) {
  return str(tag && typeof tag === "object" ? tag.value : tag);
}

// Turn one challenge from /api/v1/challenges into the shape the browser uses.
export function enrich(chal, settings) {
  let year = null;
  let eventName = null;
  let difficulty = null;
  const tags = [];

  for (const raw of chal.tags || []) {
    const tag = tagValue(raw);
    if (!tag) {
      continue;
    }
    const lower = tag.toLowerCase();
    if (YEAR_RE.test(tag)) {
      year = Math.max(year || 0, Number(tag));
    } else if (lower.startsWith("event:")) {
      eventName = tag.slice(6).trim() || eventName;
    } else if (lower.startsWith("difficulty:")) {
      difficulty = parseDifficulty(tag.slice(11)) || difficulty;
    } else if (DIFFICULTIES.some(d => d.key === lower)) {
      difficulty = parseDifficulty(lower);
    } else {
      tags.push(tag);
    }
  }

  let eventKey;
  let eventLabel;
  if (eventName) {
    eventKey = `event:${eventName.toLowerCase()}`;
    eventLabel = eventName;
  } else if (year) {
    eventKey = String(year);
    eventLabel = settings.event_name_template.replace(/\{year\}/g, year);
  } else {
    eventKey = ORIGINALS_KEY;
    eventLabel = settings.originals_label;
  }

  const category = str(chal.category) || "Uncategorized";
  const aliased = settings.category_aliases[category];

  return {
    ...chal,
    category: aliased ? str(aliased) : category,
    originalCategory: category,
    year,
    eventKey,
    eventLabel,
    difficulty,
    displayTags: tags,
    locked: chal.type === "hidden",
    searchText: [
      chal.name,
      category,
      aliased,
      eventLabel,
      difficulty && difficulty.label,
      ...tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

// Build the list of events (tabs) present in the challenge list, ordered by
// the settings. Each event: { key, label, year, total, solved }.
export function buildEvents(challenges, settings) {
  const byKey = new Map();
  for (const c of challenges) {
    let e = byKey.get(c.eventKey);
    if (!e) {
      e = {
        key: c.eventKey,
        label: c.eventLabel,
        year: c.year,
        total: 0,
        solved: 0,
        points: 0,
      };
      byKey.set(c.eventKey, e);
    }
    // Named events may also carry a year tag; use the latest for ordering
    if (c.year && (!e.year || c.year > e.year)) {
      e.year = c.year;
    }
    e.total += 1;
    if (c.solved_by_me) {
      e.solved += 1;
      e.points += Number(c.value) || 0;
    }
  }

  const dir = settings.event_order === "oldest" ? 1 : -1;
  const events = [...byKey.values()].filter(e => e.key !== ORIGINALS_KEY);
  events.sort((a, b) => {
    if (a.year !== b.year) {
      // Year-less named events sort after dated ones
      if (!a.year) return 1;
      if (!b.year) return -1;
      return (a.year - b.year) * dir;
    }
    return a.label.localeCompare(b.label);
  });

  const originals = byKey.get(ORIGINALS_KEY);
  if (originals) {
    if (settings.originals_position === "first") {
      events.unshift(originals);
    } else {
      events.push(originals);
    }
  }
  return events;
}

export function countBy(challenges, keyFn) {
  const counts = new Map();
  for (const c of challenges) {
    const k = keyFn(c);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

// filters: { event, q, categories: [], difficulties: [] (levels, 0 = unrated), status }
export function filterChallenges(challenges, filters, { skip } = {}) {
  const terms = str(filters.q).toLowerCase().split(/\s+/).filter(Boolean);
  return challenges.filter(c => {
    if (
      skip !== "event" &&
      filters.event &&
      filters.event !== ALL_KEY &&
      c.eventKey !== filters.event
    ) {
      return false;
    }
    if (
      skip !== "category" &&
      filters.categories.length &&
      !filters.categories.includes(c.category)
    ) {
      return false;
    }
    if (skip !== "difficulty" && filters.difficulties.length) {
      const level = c.difficulty ? c.difficulty.level : 0;
      if (!filters.difficulties.includes(level)) {
        return false;
      }
    }
    if (skip !== "status") {
      if (filters.status === "solved" && !c.solved_by_me) return false;
      if (filters.status === "unsolved" && c.solved_by_me) return false;
    }
    return terms.every(t => c.searchText.includes(t));
  });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function cmpNullsLast(a, b, dir) {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) {
    return an === bn ? 0 : an ? 1 : -1;
  }
  return (a < b ? -1 : a > b ? 1 : 0) * dir;
}

export const SORTS = {
  default: { label: "Default" },
  name: { label: "Name (A-Z)", cmp: (a, b) => collator.compare(a.name, b.name) },
  "solves-desc": {
    label: "Most solved",
    cmp: (a, b) => cmpNullsLast(a.solves, b.solves, -1),
  },
  "solves-asc": {
    label: "Least solved",
    cmp: (a, b) => cmpNullsLast(a.solves, b.solves, 1),
  },
  "value-desc": {
    label: "Points (high-low)",
    cmp: (a, b) => cmpNullsLast(a.value, b.value, -1),
  },
  "value-asc": {
    label: "Points (low-high)",
    cmp: (a, b) => cmpNullsLast(a.value, b.value, 1),
  },
  "difficulty-asc": {
    label: "Difficulty (easy-hard)",
    cmp: (a, b) =>
      cmpNullsLast(
        a.difficulty && a.difficulty.level,
        b.difficulty && b.difficulty.level,
        1,
      ),
  },
  "difficulty-desc": {
    label: "Difficulty (hard-easy)",
    cmp: (a, b) =>
      cmpNullsLast(
        a.difficulty && a.difficulty.level,
        b.difficulty && b.difficulty.level,
        -1,
      ),
  },
  "event-desc": {
    label: "Newest event",
    cmp: (a, b) => cmpNullsLast(a.year, b.year, -1),
  },
  "event-asc": {
    label: "Oldest event",
    cmp: (a, b) => cmpNullsLast(a.year, b.year, 1),
  },
  category: {
    label: "Category",
    cmp: (a, b) => collator.compare(a.category, b.category),
  },
};

// Stable sort. "default" keeps CTFd's order (or the admin's challenge_order
// function, applied by the caller beforehand); ties fall back to it too.
export function sortChallenges(challenges, sortKey) {
  const sort = SORTS[sortKey];
  const indexed = challenges.map((c, i) => [c, i]);
  if (sort && sort.cmp) {
    indexed.sort(([a, ai], [b, bi]) => sort.cmp(a, b) || ai - bi);
  }
  return indexed.map(([c]) => c);
}

export function sortCategories(categories, compareFn) {
  const list = [...categories];
  if (compareFn) {
    list.sort(compareFn);
  } else {
    list.sort((a, b) => collator.compare(a, b));
  }
  return list;
}

// Group already-sorted challenges. groupBy: "event" | "category" | "difficulty" | "none"
export function groupChallenges(challenges, groupBy, { events, categoryOrder } = {}) {
  if (groupBy === "none") {
    return [{ key: "all", label: null, challenges }];
  }
  const groups = new Map();
  for (const c of challenges) {
    let key, label;
    if (groupBy === "event") {
      key = c.eventKey;
      label = c.eventLabel;
    } else if (groupBy === "difficulty") {
      key = c.difficulty ? String(c.difficulty.level) : "0";
      label = c.difficulty ? c.difficulty.label : "Unrated";
    } else {
      key = c.category;
      label = c.category;
    }
    if (!groups.has(key)) {
      groups.set(key, { key, label, challenges: [] });
    }
    groups.get(key).challenges.push(c);
  }

  let order;
  if (groupBy === "event" && events) {
    order = events.map(e => e.key);
  } else if (groupBy === "category" && categoryOrder) {
    order = categoryOrder;
  } else if (groupBy === "difficulty") {
    order = ["1", "2", "3", "4", "5", "0"];
  }
  const list = [...groups.values()];
  if (order) {
    const pos = k => {
      const i = order.indexOf(k);
      return i < 0 ? order.length : i;
    };
    list.sort((a, b) => pos(a.key) - pos(b.key) || collator.compare(a.label, b.label));
  }
  for (const g of list) {
    g.solved = g.challenges.filter(c => c.solved_by_me).length;
  }
  return list;
}
