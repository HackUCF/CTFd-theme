import Alpine from "alpinejs";
import { Modal } from "bootstrap";

import CTFd from "../index";
import { addTargetBlank } from "../utils/links";
import {
  ALL_KEY,
  DIFFICULTIES,
  SORTS,
  buildEvents,
  countBy,
  enrich,
  filterChallenges,
  groupChallenges,
  normalizeSettings,
  sortCategories,
  sortChallenges,
} from "./model";

const PREFS_KEY = "archive-browser-prefs";
const COLLAPSED_KEY = "archive-browser-collapsed";
const VIEWS = ["board", "list"];
const GROUPS = ["auto", "event", "category", "difficulty", "none"];
const STATUSES = ["all", "unsolved", "solved"];

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(window.localStorage.getItem(key));
    return v && typeof v === "object" ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Storage may be unavailable (private mode); preferences just won't stick
  }
}

// Admin-supplied compareFn source from the theme settings, or null
function userCompareFn(source, name) {
  if (!source) {
    return null;
  }
  try {
    return new Function(`return (${source})`)();
  } catch (error) {
    console.log(`Error running ${name} function`);
    console.log(error);
    return null;
  }
}

export default () => ({
  loaded: false,
  challenges: [],
  events: [],
  settings: normalizeSettings(null),
  categoryCompare: null,

  filters: { event: ALL_KEY, q: "", categories: [], difficulties: [], status: "all" },
  sort: "default",
  view: "board",
  groupBy: "auto",
  collapsed: {},
  showFilters: false,

  sorts: Object.entries(SORTS).map(([key, s]) => ({ key, label: s.label })),
  difficultyLevels: DIFFICULTIES,

  async init() {
    const theme = CTFd.config.themeSettings || {};
    this.settings = normalizeSettings(theme);
    this.categoryCompare = userCompareFn(
      theme.challenge_category_order,
      "challenge_category_order",
    );

    const prefs = loadJSON(PREFS_KEY, {});
    if (VIEWS.includes(prefs.view)) this.view = prefs.view;
    else if (VIEWS.includes(theme.default_view)) this.view = theme.default_view;
    if (GROUPS.includes(prefs.groupBy)) this.groupBy = prefs.groupBy;
    if (prefs.sort in SORTS) this.sort = prefs.sort;
    this.collapsed = loadJSON(COLLAPSED_KEY, {});

    // Read the URL before the first await so the initial render already uses
    // it (changing view and loaded in the same tick confuses Alpine 3.9)
    this.readURL();
    await this.loadChallenges();
    this.validateEvent(theme.default_event);
    this.loaded = true;
    this.$nextTick(() => {
      const active = this.$el.querySelector(".event-tabs .active");
      if (active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    this.$watch("filters", () => this.writeURL());
    for (const key of ["sort", "view", "groupBy"]) {
      this.$watch(key, () => {
        this.writeURL();
        saveJSON(PREFS_KEY, {
          sort: this.sort,
          view: this.view,
          groupBy: this.groupBy,
        });
      });
    }

    window.addEventListener("keydown", e => {
      const target = e.target;
      const typing =
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (e.key === "/" && !typing && !document.querySelector(".modal.show")) {
        e.preventDefault();
        this.$refs.search.focus();
      }
    });

    if (window.location.hash) {
      let chalHash = decodeURIComponent(window.location.hash.substring(1));
      let idx = chalHash.lastIndexOf("-");
      if (idx >= 0) {
        let id = chalHash.slice(idx + 1);
        await this.loadChallenge(id);
      }
    }
  },

  async loadChallenges() {
    const raw = await CTFd.pages.challenges.getChallenges();
    let list = raw.map(c => enrich(c, this.settings));

    const challengeOrder = userCompareFn(
      CTFd.config.themeSettings?.challenge_order,
      "challenge_order",
    );
    if (challengeOrder) {
      try {
        list.sort(challengeOrder);
      } catch (error) {
        console.log("Error running challenge_order function");
        console.log(error);
      }
    }

    this.challenges = list;
    this.events = buildEvents(list, this.settings);
  },

  // URL query state, so filtered views can be bookmarked and shared:
  //   ?event=2019&category=Pwn,Web&difficulty=2,3&status=unsolved&q=heap&sort=name&view=list&group=none
  readURL() {
    const params = new URLSearchParams(window.location.search);
    const list = key =>
      (params.get(key) || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

    this.filters.event = params.get("event") || "";
    this.filters.q = params.get("q") || "";
    this.filters.categories = list("category");
    this.filters.difficulties = list("difficulty")
      .map(Number)
      .filter(n => n >= 0 && n <= 5);
    const status = params.get("status");
    this.filters.status = STATUSES.includes(status) ? status : "all";
    if (params.get("sort") in SORTS) this.sort = params.get("sort");
    if (VIEWS.includes(params.get("view"))) this.view = params.get("view");
    if (GROUPS.includes(params.get("group"))) this.groupBy = params.get("group");
  },

  // Once the events are known: fall back to the default tab if the URL named
  // none (or one that doesn't exist)
  validateEvent(defaultEvent) {
    const keys = this.events.map(e => e.key);
    let event = this.filters.event;
    if (!event) {
      event = defaultEvent === "newest" ? keys[0] : defaultEvent;
    }
    this.filters.event = keys.includes(event) ? event : ALL_KEY;
  },

  writeURL() {
    const params = new URLSearchParams();
    const f = this.filters;
    if (f.event !== ALL_KEY) params.set("event", f.event);
    if (f.q.trim()) params.set("q", f.q.trim());
    if (f.categories.length) params.set("category", f.categories.join(","));
    if (f.difficulties.length) params.set("difficulty", f.difficulties.join(","));
    if (f.status !== "all") params.set("status", f.status);
    if (this.sort !== "default") params.set("sort", this.sort);
    if (this.view !== "board") params.set("view", this.view);
    if (this.groupBy !== "auto") params.set("group", this.groupBy);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    history.replaceState(history.state, "", url);
  },

  // --- derived data -------------------------------------------------------

  get eventChallenges() {
    return filterChallenges(this.challenges, {
      ...this.filters,
      categories: [],
      difficulties: [],
      q: "",
      status: "all",
    });
  },

  get visible() {
    return sortChallenges(filterChallenges(this.challenges, this.filters), this.sort);
  },

  get effectiveGroup() {
    if (this.groupBy !== "auto") {
      return this.groupBy;
    }
    return this.filters.event === ALL_KEY ? "event" : "category";
  },

  get groups() {
    return groupChallenges(this.visible, this.effectiveGroup, {
      events: this.events,
      categoryOrder: this.categories.map(c => c.name),
    });
  },

  get categories() {
    const counts = countBy(
      filterChallenges(this.challenges, this.filters, { skip: "category" }),
      c => c.category,
    );
    const names = new Set(this.eventChallenges.map(c => c.category));
    // Keep selected categories visible even if the event tab doesn't have them
    this.filters.categories.forEach(c => names.add(c));
    return sortCategories(names, this.categoryCompare).map(name => ({
      name,
      count: counts.get(name) || 0,
    }));
  },

  get difficulties() {
    const base = this.eventChallenges;
    if (!base.some(c => c.difficulty)) {
      return [];
    }
    const counts = countBy(
      filterChallenges(this.challenges, this.filters, { skip: "difficulty" }),
      c => (c.difficulty ? c.difficulty.level : 0),
    );
    const present = new Set(base.map(c => (c.difficulty ? c.difficulty.level : 0)));
    return [...DIFFICULTIES, { level: 0, key: "unrated", label: "Unrated" }]
      .filter(d => present.has(d.level) || this.filters.difficulties.includes(d.level))
      .map(d => ({ ...d, count: counts.get(d.level) || 0 }));
  },

  get statusCounts() {
    const base = filterChallenges(this.challenges, this.filters, { skip: "status" });
    const solved = base.filter(c => c.solved_by_me).length;
    return { all: base.length, solved, unsolved: base.length - solved };
  },

  get totals() {
    const solved = this.challenges.filter(c => c.solved_by_me);
    return {
      total: this.challenges.length,
      solved: solved.length,
      points: solved.reduce((sum, c) => sum + (Number(c.value) || 0), 0),
    };
  },

  get currentEvent() {
    return this.events.find(e => e.key === this.filters.event) || null;
  },

  get activeFilterCount() {
    const f = this.filters;
    return (
      (f.q.trim() ? 1 : 0) +
      f.categories.length +
      f.difficulties.length +
      (f.status !== "all" ? 1 : 0)
    );
  },

  get showEventOnCards() {
    return this.filters.event === ALL_KEY && this.effectiveGroup !== "event";
  },

  // --- actions ------------------------------------------------------------

  selectEvent(key) {
    this.filters.event = key;
    // Drop category filters that don't exist in the new tab
    const names = new Set(this.eventChallenges.map(c => c.category));
    this.filters.categories = this.filters.categories.filter(c => names.has(c));
  },

  toggle(list, value) {
    const i = this.filters[list].indexOf(value);
    if (i >= 0) {
      this.filters[list].splice(i, 1);
    } else {
      this.filters[list].push(value);
    }
  },

  isSelected(list, value) {
    return this.filters[list].includes(value);
  },

  clearFilters() {
    this.filters.q = "";
    this.filters.categories = [];
    this.filters.difficulties = [];
    this.filters.status = "all";
  },

  setSort(key) {
    // Clicking a list-view column header toggles between its two directions
    const pairs = {
      solves: ["solves-desc", "solves-asc"],
      value: ["value-desc", "value-asc"],
      difficulty: ["difficulty-asc", "difficulty-desc"],
      event: ["event-desc", "event-asc"],
    };
    if (pairs[key]) {
      this.sort = this.sort === pairs[key][0] ? pairs[key][1] : pairs[key][0];
    } else {
      this.sort = this.sort === key ? "default" : key;
    }
  },

  sortIcon(key) {
    const s = this.sort;
    if (s === key || s.startsWith(`${key}-`)) {
      return s.endsWith("-asc") || s === key ? "fa-sort-up" : "fa-sort-down";
    }
    return "fa-sort text-body-tertiary";
  },

  groupId(group) {
    return `${this.effectiveGroup}:${group.key}`;
  },

  isCollapsed(group) {
    return !!this.collapsed[this.groupId(group)];
  },

  toggleGroup(group) {
    const id = this.groupId(group);
    if (this.collapsed[id]) {
      delete this.collapsed[id];
    } else {
      this.collapsed[id] = true;
    }
    saveJSON(COLLAPSED_KEY, this.collapsed);
  },

  setAllCollapsed(value) {
    for (const g of this.groups) {
      const id = this.groupId(g);
      if (value) this.collapsed[id] = true;
      else delete this.collapsed[id];
    }
    saveJSON(COLLAPSED_KEY, this.collapsed);
  },

  randomUnsolved() {
    const pool = this.visible.filter(c => !c.solved_by_me && !c.locked);
    if (pool.length) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      this.loadChallenge(c.id);
    }
  },

  shortEvent(c) {
    return c.year && c.eventKey === String(c.year) ? String(c.year) : c.eventLabel;
  },

  difficultyClass(d) {
    return d ? `difficulty-${d.key}` : "";
  },

  // --- challenge modal (same flow as the core theme's ChallengeBoard) ------

  async reloadChallenges() {
    await this.loadChallenges();
  },

  async loadChallenge(challengeId) {
    await CTFd.pages.challenge.displayChallenge(challengeId, challenge => {
      challenge.data.view = addTargetBlank(challenge.data.view);
      Alpine.store("challenge").meta =
        this.challenges.find(c => c.id === Number(challengeId)) || null;
      Alpine.store("challenge").data = challenge.data;

      // nextTick is required here because we're working in a callback
      Alpine.nextTick(() => {
        let modal = Modal.getOrCreateInstance("[x-ref='challengeWindow']");
        // TODO: Get rid of this private attribute access
        // See https://github.com/twbs/bootstrap/issues/31266
        modal._element.addEventListener(
          "hidden.bs.modal",
          event => {
            // Remove location hash
            history.replaceState(
              null,
              null,
              `${window.location.pathname}${window.location.search}`,
            );
          },
          { once: true },
        );
        modal.show();
        history.replaceState(null, null, `#${challenge.data.name}-${challengeId}`);
      });
    });
  },
});
