// Handout links. Challenge descriptions can list downloadable files that the
// web server hosts outside CTFd as Markdown list items:
//
//   * [rot13](/files/sun/18/Pwn/Rot13/rot13)
//
// The challenge modal moves those items out of the description and shows them
// as file buttons, like files uploaded to CTFd. Without this theme they are
// still ordinary links.

export const HANDOUT_PREFIX = "/files/";

// The link's href if it points at a same-site handout, else null
export function handoutHref(a, origin) {
  const raw = a.getAttribute("href") || "";
  let url;
  try {
    url = new URL(raw, origin);
  } catch (e) {
    return null;
  }
  if (
    url.origin !== new URL(origin).origin ||
    !url.pathname.startsWith(HANDOUT_PREFIX)
  ) {
    return null;
  }
  return raw;
}

// A list item holding nothing but one handout link
function handoutOf(li, origin) {
  const kids = li.children;
  if (kids.length !== 1 || kids[0].tagName !== "A") {
    return null;
  }
  const a = kids[0];
  const name = a.textContent.trim();
  if (!name || li.textContent.trim() !== name) {
    return null;
  }
  const href = handoutHref(a, origin);
  return href ? { name, href } : null;
}

// Remove handout list items from a rendered description; returns [{name, href}]
export function extractHandouts(root, origin) {
  const found = [];
  if (!root) {
    return found;
  }
  for (const list of [...root.querySelectorAll("ul, ol")]) {
    for (const li of [...list.children]) {
      if (li.tagName !== "LI") {
        continue;
      }
      const handout = handoutOf(li, origin);
      if (handout) {
        found.push(handout);
        li.remove();
      }
    }
    if (!list.children.length) {
      list.remove();
    }
  }
  return found;
}
