import test from "node:test";
import assert from "node:assert/strict";

import { extractHandouts, handoutHref } from "../assets/js/archive/handouts.js";

// Just enough of the DOM for extractHandouts
class El {
  constructor(tagName, children = [], attrs = {}) {
    this.tagName = tagName;
    this.attrs = attrs;
    this.parent = null;
    this.childList = [];
    for (const c of children) {
      this.append(c);
    }
  }
  append(c) {
    if (typeof c !== "string") {
      c.parent = this;
    }
    this.childList.push(c);
  }
  get children() {
    return this.childList.filter(c => typeof c !== "string");
  }
  get textContent() {
    return this.childList.map(c => (typeof c === "string" ? c : c.textContent)).join("");
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  remove() {
    this.parent.childList = this.parent.childList.filter(c => c !== this);
  }
  querySelectorAll() {
    const out = [];
    const walk = el => {
      for (const c of el.children) {
        if (c.tagName === "UL" || c.tagName === "OL") {
          out.push(c);
        }
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}
const a = (href, text) => new El("A", [text], { href });
const li = (...kids) => new El("LI", kids);
const ORIGIN = "https://ctf.hackucf.org";

test("handoutHref accepts only same-site /files/ links", () => {
  assert.equal(handoutHref(a("/files/sun/18/Pwn/Rot13/rot13", "x"), ORIGIN), "/files/sun/18/Pwn/Rot13/rot13");
  assert.equal(handoutHref(a("https://ctf.hackucf.org/files/hackucf/a", "x"), ORIGIN), "https://ctf.hackucf.org/files/hackucf/a");
  assert.equal(handoutHref(a("https://example.com/files/a", "x"), ORIGIN), null);
  assert.equal(handoutHref(a("/challenges", "x"), ORIGIN), null);
  assert.equal(handoutHref(a("https://wargames.ret2.systems/x", "x"), ORIGIN), null);
});

test("extractHandouts lifts link-only list items and drops emptied lists", () => {
  const files = new El("UL", [
    li(a("/files/sun/18/Pwn/Rot13/rot13", "rot13")),
    li(a("/files/sun/18/Pwn/Rot13/rot13-libc.so", "rot13-libc.so")),
  ]);
  const prose = new El("UL", [li("Read ", a("/files/x/notes.txt", "the notes"), " first")]);
  const mixed = new El("UL", [li(a("https://example.com/", "elsewhere")), li(a("/files/x/y", "y"))]);
  const root = new El("SPAN", [new El("P", ["Pwn it."]), prose, mixed, files]);

  const found = extractHandouts(root, ORIGIN);
  assert.deepEqual(found, [
    { name: "y", href: "/files/x/y" },
    { name: "rot13", href: "/files/sun/18/Pwn/Rot13/rot13" },
    { name: "rot13-libc.so", href: "/files/sun/18/Pwn/Rot13/rot13-libc.so" },
  ]);
  // The all-handout list is gone; a link inside prose and other links stay
  assert.deepEqual(root.children.map(c => c.tagName), ["P", "UL", "UL"]);
  assert.equal(prose.children.length, 1);
  assert.equal(mixed.children.length, 1);
  assert.equal(extractHandouts(null, ORIGIN).length, 0);
});
