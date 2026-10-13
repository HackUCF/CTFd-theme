#!/usr/bin/env python3
"""Add FAKE demo data to the dev CTFd so every theme feature has something to show.

Run after dev/setup.py and after installing challenges (e.g. `ctf challenge
install` from each challenge repo):

    python3 dev/demo.py

It is idempotent and only touches the dev instance from dev/.env: it creates
player accounts and solves a spread of challenges so solve counts, the solved
state and per-event progress are visible.

Player login: player / player-password-dev
"""
import json
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup import Client  # noqa: E402

HERE = Path(__file__).resolve().parent
PLAYERS = [("player", "player-password-dev")] + [(f"bot{i}", "bot-password-dev") for i in range(1, 9)]


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


def main():
    env = load_env()
    url = env["CTFCLI_URL"]
    admin = Admin(url, env["CTFCLI_ACCESS_TOKEN"])

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
