# Hack@UCF archive theme for CTFd

A CTFd 3.8 theme for hosting a large archive of challenges from many events
(every SunshineCTF since 2017, plus Hack@UCF's own originals) on one CTFd. It's
a fork of CTFd's `core` theme (core-beta) that replaces the challenge board
with a browser built for hundreds of challenges. Every other page is unchanged.

- **Event tabs:** All, then one tab per event (SunshineCTF 2025 ... 2017),
  then Hack@UCF Originals. Each tab shows your solved/total count.
- **Filters:** search by name, category, or tag (press `/` to focus it), filter
  by solved/unsolved, and pick categories and difficulty levels. Each option
  shows how many challenges match the current filters.
- **Sorting:** default order, name, most or least solved, points, difficulty,
  or event.
- **Board view:** compact cards with points, solve count, and difficulty,
  grouped by event, category, difficulty, or not at all. Groups collapse and
  show a progress bar.
- **List view:** a sortable table in the style of picoCTF's challenge list.
- **Shareable URLs:** the view lives in the query string, for example
  `/challenges?event=2019&category=Pwn&status=unsolved&view=list`.
- **Remembered preferences:** each player's view, sort, grouping, and collapsed
  groups are kept in their browser.
- **Random:** opens a random unsolved challenge from the current list.
- **Challenge modal:** shows the category, event, and difficulty.

## How challenges are organized

Everything comes from challenge **tags**, so no CTFd plugin or database change
is needed:

| Tag | Meaning |
| --- | --- |
| `2019` | Belongs to event "SunshineCTF 2019". The name template is a theme setting. |
| `event:<name>` | Belongs to the event `<name>`, which also gets its own tab. Use this for events that aren't a SunshineCTF year. |
| `difficulty:<level>` | `beginner`, `easy`, `medium`, `hard`, or `insane` (or `1`-`5`). Difficulty filters appear once any challenge has one. |
| *(no year or `event:` tag)* | Goes to the "Hack@UCF Originals" tab. |

The challenge cards and modal hide these tags. Any other tags show as normal
tags. The SunshineCTF archive's `challenge.yml` files already carry the year
tag. Add a `difficulty:` tag in a challenge's `tags:` list to rate it.

## Theme settings

Set these in CTFd at Admin → Config → Theme → Theme Settings. The core theme's
settings still work.

- **Event Name Template:** label for year tags, where `{year}` is replaced.
  Default: `SunshineCTF {year}`.
- **Originals Label:** default `Hack@UCF Originals`.
- **Event Tab Order:** newest or oldest first.
- **Originals Tab Position:** before or after the events.
- **Default Tab:** All, or the first event.
- **Default View:** board or list.
- **Category Aliases:** one `From = To` per line, used to merge category names
  that differ between years. For example, `RE = Reversing` merges 2025's "RE"
  into "Reversing".
- **Challenge Order:** the core theme's custom sort function, still honored.
  It sets the "Default" sort order.
- **Category Order:** the core theme's custom sort function, still honored.
  It orders the category filters and category groups.

## Installing

CTFd loads themes from `CTFd/themes/<name>/`, and the built `static/` directory
is committed. Copy or mount this repo there, for example as
`CTFd/themes/archive`, then select it under Admin → Config → Theme. With the
official Docker image:

```yaml
volumes:
  - ./theme:/opt/CTFd/CTFd/themes/archive:ro
```

## Development

```bash
yarn install
yarn build        # build assets into static/ (yarn dev = watch mode)
yarn test         # unit tests for the filtering/sorting model (node --test)
yarn lint         # prettier
```

`dev/` runs a disposable local CTFd (official `ctfd/ctfd:3.8.8` image) with
this repo mounted as the `archive` theme:

```bash
docker compose -f dev/compose.yml up -d    # http://127.0.0.1:8000
python3 dev/setup.py                       # setup wizard + admin token -> dev/.env
. dev/.env
(cd ../sun && ctf challenge install)       # load the SunshineCTF archive with ctfcli
python3 dev/demo.py                        # optional FAKE data: see below
```

`dev/demo.py` exists only to exercise the UI. It adds placeholder "original"
challenges and **made-up** `difficulty:` tags based on a hash of each
challenge's name. It also creates player accounts with random solves. Logins
are `admin` / `admin-password-dev` and `player` / `player-password-dev`. To
reset everything, run `docker compose -f dev/compose.yml down -v`.

Template edits show up on reload. After changing JS or SCSS, run `yarn reload`
(build and restart CTFd), because CTFd caches the asset manifest.

### Where the code lives

- `assets/js/archive/model.js`: tag parsing, filtering, sorting, and grouping.
  It's pure functions, unit tested in `test/`.
- `assets/js/archive/browser.js`: the `ChallengeBrowser` Alpine component,
  covering URL state, preferences, and the challenge modal.
- `templates/challenges.html`: page markup.
- `templates/challenge.html`: modal markup, with the context line and tag
  filtering.
- `assets/scss/includes/components/_archive.scss`: styles.
- `templates/config.html`: admin theme-settings form.

To update from upstream, diff against `CTFd/themes/core` in CTFd. This fork
started at CTFd commit `6b01b531` (3.8.8).

## License

Apache 2.0, the same as CTFd's core theme. See [LICENSE](LICENSE).
