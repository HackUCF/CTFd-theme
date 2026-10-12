#!/usr/bin/env python3
"""Add FAKE demo data to the dev CTFd so every theme feature has something to show.

Run after dev/setup.py and after installing challenges (e.g. `ctf challenge
install` from the archive repo):

    python3 dev/demo.py

It is idempotent and only touches the dev instance from dev/.env:
  * tags challenges with a made-up `difficulty:` level (a hash of the name,
    NOT a real rating) unless they already have one
  * adds a few placeholder "Hack@UCF original" challenges (no year tag)
  * creates player accounts and solves a spread of challenges so solve counts,
    the solved state and per-event progress are visible

Player login: player / player-password-dev
"""
import hashlib
import json
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup import Client  # noqa: E402

HERE = Path(__file__).resolve().parent
LEVELS = ["beginner", "easy", "medium", "hard", "insane"]
PLAYERS = [("player", "player-password-dev")] + [(f"bot{i}", "bot-password-dev") for i in range(1, 9)]

ORIGINALS = [
    ("Welcome to Hack@UCF", "Misc", "difficulty:beginner", "Find the flag on this page: `hackucf{welcome}`", "hackucf{welcome}"),
    ("Stack Basics", "Pwn", "difficulty:easy", "Placeholder original challenge for theme testing.", "hackucf{stack_basics}"),
    ("Cookie Monster", "Web", "difficulty:easy", "Placeholder original challenge for theme testing.", "hackucf{cookies}"),
    ("XOR Warmup", "Crypto", "difficulty:beginner", "Placeholder original challenge for theme testing.", "hackucf{xor}"),
    ("Format Fiesta", "Pwn", "difficulty:medium", "Placeholder original challenge for theme testing.", "hackucf{fmt}"),
    ("Packet Party", "Forensics", "difficulty:medium", "Placeholder original challenge for theme testing.", "hackucf{pcap}"),
]


def load_env():
    env = {}
    for line in (HERE / ".env").read_text().splitlines():
        if line.startswith("export "):
            k, _, v = line[7:].partition("=")
            env[k] = v
    return env


class Admin:
    def __init__(self, url, token):
        self.c = Client(url)
        self.headers = {"Authorization": f"Token {token}", "Content-Type": "application/json"}

    def api(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.c.url + "/api/v1" + path, data=data, method=method, headers=self.headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{method} {path}: HTTP {e.code} {e.read()[:300]!r}")


def fake_level(name):
    h = int(hashlib.sha256(name.encode()).hexdigest(), 16)
    # Skew toward easy/medium like a real event
    return LEVELS[[0, 1, 1, 2, 2, 2, 3, 3, 4][h % 9]]


def main():
    env = load_env()
    url = env["CTFCLI_URL"]
    admin = Admin(url, env["CTFCLI_ACCESS_TOKEN"])

    chals = admin.api("GET", "/challenges?view=admin&per_page=1000")["data"]
    existing = {c["name"] for c in chals}

    for name, category, tag, desc, flag in ORIGINALS:
        if name in existing:
            continue
        c = admin.api("POST", "/challenges", {
            "name": name, "category": category, "description": desc, "value": 100,
            "type": "standard", "state": "visible",
        })["data"]
        admin.api("POST", "/flags", {"challenge": c["id"], "content": flag, "type": "static"})
        admin.api("POST", "/tags", {"challenge": c["id"], "value": tag})
        print(f"added original: {name}")

    chals = admin.api("GET", "/challenges?view=admin&per_page=1000")["data"]
    tagged = 0
    for c in chals:
        tags = admin.api("GET", f"/challenges/{c['id']}/tags")["data"]
        if not any(t["value"].lower().startswith("difficulty:") for t in tags):
            admin.api("POST", "/tags", {"challenge": c["id"], "value": f"difficulty:{fake_level(c['name'])}"})
            tagged += 1
    print(f"tagged {tagged} challenges with fake difficulty levels")

    flags = {}
    for f in admin.api("GET", "/flags")["data"]:
        if f["type"] == "static":
            flags.setdefault(f["challenge_id"], f["content"])

    rng = random.Random(1337)
    ids = sorted(flags)
    for i, (name, password) in enumerate(PLAYERS):
        p = Client(url)
        p.page("/register")
        status, _, final = p.request("POST", "/register", data={
            "name": name, "email": f"{name}@example.com", "password": password, "nonce": p.nonce,
        })
        if "/register" in final:
            p = Client(url)
            p.login(name, password)
        else:
            p.page("/challenges")
        # The main player solves ~15%; bots solve a varying share so counts differ
        share = 0.15 if i == 0 else rng.uniform(0.05, 0.6)
        picks = [cid for cid in ids if rng.random() < share * (1.5 if cid % 3 == 0 else 0.7)]
        solved = 0
        for cid in picks:
            status, text, _ = p.request("POST", "/api/v1/challenges/attempt",
                                        json_body={"challenge_id": cid, "submission": flags[cid]})
            if status == 200 and json.loads(text)["data"]["status"] in ("correct", "already_solved"):
                solved += 1
        print(f"{name}: solved {solved}")


if __name__ == "__main__":
    main()
