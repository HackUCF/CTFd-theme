#!/usr/bin/env python3
"""First-run setup for the dev CTFd in dev/compose.yml (stdlib only).

Completes CTFd's /setup wizard with this theme selected, creates an admin API
token, and writes dev/.env (gitignored) for ctfcli and the other dev scripts:

    python3 dev/setup.py [--url http://127.0.0.1:8000]
    . dev/.env

Dev-only credentials: admin / admin-password-dev.
"""
import argparse
import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADMIN = {"name": "admin", "email": "admin@example.com", "password": "admin-password-dev"}


class Client:
    def __init__(self, url):
        self.url = url.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.nonce = None

    def request(self, method, path, data=None, json_body=None, headers=None):
        headers = dict(headers or {})
        body = None
        if json_body is not None:
            body = json.dumps(json_body).encode()
            headers["Content-Type"] = "application/json"
            if self.nonce:
                headers["CSRF-Token"] = self.nonce
        elif data is not None:
            body = urllib.parse.urlencode(data).encode()
        req = urllib.request.Request(self.url + path, data=body, method=method, headers=headers)
        try:
            with self.opener.open(req, timeout=30) as resp:
                return resp.status, resp.read().decode(), resp.geturl()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(), e.geturl()

    def page(self, path):
        status, text, final = self.request("GET", path)
        m = re.search(r"'csrfNonce': \"([0-9a-f]+)\"", text)
        if m:
            self.nonce = m.group(1)
        return status, text, final

    def login(self, name, password):
        self.page("/login")
        status, text, final = self.request(
            "POST", "/login", data={"name": name, "password": password, "nonce": self.nonce}
        )
        self.page("/challenges")
        if "/login" in final:
            raise SystemExit(f"login as {name} failed")


def wait_for(url):
    for _ in range(60):
        try:
            urllib.request.urlopen(url + "/healthcheck", timeout=5)
            return
        except Exception:
            time.sleep(1)
    raise SystemExit(f"CTFd at {url} did not come up")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    args = ap.parse_args()

    wait_for(args.url)
    c = Client(args.url)
    status, text, final = c.page("/setup")
    if final.rstrip("/").endswith("/setup"):
        form = {
            "ctf_name": "Hack@UCF CTF (dev)",
            "ctf_description": "Theme development instance",
            "user_mode": "users",
            "challenge_visibility": "public",
            "account_visibility": "public",
            "score_visibility": "public",
            "registration_visibility": "public",
            "verify_emails": "false",
            "ctf_theme": "archive",
            "start": "",
            "end": "",
            "nonce": c.nonce,
            **ADMIN,
        }
        status, text, final = c.request("POST", "/setup", data=form)
        if final.rstrip("/").endswith("/setup"):
            sys.exit(f"setup failed (HTTP {status})")
        print("CTFd setup complete (theme: archive)")
    else:
        print("CTFd already set up; logging in")
        c.login(ADMIN["name"], ADMIN["password"])

    c.page("/challenges")
    status, text, _ = c.request("POST", "/api/v1/tokens", json_body={"description": "theme dev"})
    if status != 200:
        sys.exit(f"token creation failed: HTTP {status} {text[:200]}")
    token = json.loads(text)["data"]["value"]

    env = HERE / ".env"
    env.write_text(
        f"export CTFCLI_URL={args.url}\nexport CTFCLI_ACCESS_TOKEN={token}\n"
        f"# admin login: {ADMIN['name']} / {ADMIN['password']}\n"
    )
    print(f"wrote {env.relative_to(Path.cwd()) if env.is_relative_to(Path.cwd()) else env}")


if __name__ == "__main__":
    main()
