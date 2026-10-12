# npmpulse

Download-history charts for npm packages, with the full record going back to
npm's first data day — not just the ~18 months the public API will return in one
request.

Two things it does:

- **The site** — add one or more packages as pills, get a chart. Daily / weekly
  / monthly / yearly, any date range, linear or log scale. Series can be toggled
  on and off without re-fetching, and the view is fully encoded in the URL
  (`?q=react,vue&range=5y&scale=log`), so every chart is a shareable link.
- **The embed endpoint** — `GET /api/svg?q=react` returns an SVG that stays
  current in a README, like a CI badge.

## Why the chunking exists

Everything here follows from four things about `api.npmjs.org`, all verified
against the live API:

| Fact                                                                                                                    | Consequence                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A single-package range is capped at **549 days**, and an over-long range is **silently truncated** rather than erroring | You cannot get full history in one request, and you cannot tell you were short-changed unless you check |
| A multi-package (bulk) range is capped at **365 days**                                                                  | Comparison needs a different chunk size than a single package                                           |
| One bulk request covers **up to 128 packages**                                                                          | Adding packages does not add requests — 12 chunks covers full history for any number of them            |
| Data starts **2015-01-10**, but every package reports 0 for the first weeks (real values begin **2015-02-27**)          | The head of every series is a flat false zero-run                                                       |

So a full-history chart is 8 chunk requests for one package, or 12 for several,
stitched back together. `src/lib/npm-api.ts` does that and refuses to return a
series it can detect was truncated.

## Data quirks this codebase handles

These are real properties of npm's public data, not bugs here. Each is handled
explicitly.

- **Leading zeros.** Before a package is published, the API reports `0` rather
  than omitting the day — so a package first published in 2020 would otherwise
  render as five years of flat zero followed by a climb. Leading zero-runs are
  trimmed. (Measured: `vite` trims 1928 days, reaching its real start at
  2020-04-21.)
- **Trailing zeros.** The most recent day or two is always `0`, because npm has
  not finalised it. Trimmed, so charts do not end in a cliff.
- **Interior holes.** Individual days are occasionally `0` across _every_
  package at once — npm lost that day's logs. A day with zero downloads is
  impossible for a package serving millions, so a run of zeros bounded by real
  data on both sides is linearly interpolated.
- **Incomplete periods.** A month with 10 of 31 days sums to a third of a real
  month and reads as a collapse. Partial periods at either end of the range are
  dropped — unless that would leave nothing to draw.
- **Upstream spikes.** Some months are genuinely inflated in npm's data
  (svelte's 2022-11-23 records 5.0M downloads against a ~80K norm). These are
  left alone: they are what the source says.
- **Rate limiting.** Sustained use gets `429`. Chunk requests retry with
  exponential backoff and honour `Retry-After`.

Every trim and interpolation is counted and shown in the UI rather than applied
silently — see `HygieneNote`.

## Architecture

```
data/downloads.json  the snapshot the generated pages render from
src/lib/         pure TypeScript: no DOM, no React, no Node APIs
  npm-api.ts     chunked fetching, truncation guard, retry/backoff
  aggregate.ts   head/tail trims, gap interpolation, period rollup
  svg-chart.ts   dependency-free SVG renderer
  cache.ts       compact localStorage cache (browser only)
src/components/  React islands (Mantine)
worker/index.ts  /api/svg, then falls through to static assets
worker/www.ts    301s www to the apex (its own Worker; see Deploying)
```

Two renderers, for a reason: `@mantine/charts` is Recharts-based and needs a
DOM, so it cannot draw inside a Worker. `svg-chart.ts` is a pure function from
data to an SVG string, which lets the same drawing code serve the embed at the
edge and the "download SVG" button in the browser.

`wrangler.jsonc` sets `run_worker_first: ["/api/*"]`, so static page views never
invoke the Worker — they are free and unmetered, and only embeds consume the
request quota.

### CPU budget

Workers on the free plan get **10ms of CPU per request**. Measured cold-cache
cost of the embed path (parse + aggregate + render, no network wait):

| Request                           | JSON   | CPU     |
| --------------------------------- | ------ | ------- |
| 1 package, 1 year _(the default)_ | 15 KB  | 0.4 ms  |
| 1 package, full history, daily    | 173 KB | 2.2 ms  |
| 4 packages, 2 years, weekly       | 118 KB | 5.7 ms  |
| 8 packages, full history          | 1.3 MB | 13.5 ms |

The last one is over budget, and the cost is `JSON.parse` — aggregating to
monthly does not help, because the daily data still has to be fetched and parsed
first. Requests above the budget get an actionable 400 instead of an opaque
failure. The interactive site has no such ceiling: browser CPU is not metered.

## Development

```bash
pnpm install
pnpm dev                     # site on :4321
pnpm dev:api                 # the embed Worker on :8787, in another shell
pnpm build                   # static output to dist/
pnpm cf:dev                  # build + wrangler dev on :8787
pnpm cf:deploy               # build + deploy to Cloudflare
pnpm data:refresh            # refetch the data the generated pages render from
pnpm og                      # redraw the social card
```

In production the site and the embed endpoint share an origin, so `/api/svg` is
just a path. In development they are separate processes, so `astro.config.mjs`
proxies `/api` to the Worker on :8787 — run `pnpm dev:api` alongside `pnpm dev`
and the embed links the panel hands out resolve locally too, rather than 404ing
against the Astro dev server.

### Linting, formatting and headers

```bash
pnpm lint         # biome check over every code file
pnpm lint:fix     # the same, applying its fixes (--unsafe included)
pnpm format       # biome format --write
pnpm format:md    # prettier --write on *.md/*.mdx (width 80, prose wrapped)
pnpm typecheck    # tsc --noEmit
pnpm check        # lint + typecheck + license:check -- what CI gates on
```

Biome owns the code and prettier owns the prose; `.prettierignore` ignores
everything but markdown so the two cannot fight over the same file. The settings
live in `.prettierrc.json` rather than in the script, so an editor's
format-on-save uses them too.

## Testing

```bash
pnpm test           # vitest, hermetic, ~420 tests
pnpm test:watch     # same, in watch mode
pnpm test:cov       # with coverage; enforces the thresholds below
pnpm check:live     # the network-dependent checks, kept separate on purpose
```

Coverage thresholds live in `vitest.config.ts` (90% statements/lines/functions,
85% branches) and fail the run, which is the point — CI runs `test:cov`, so the
floor cannot quietly erode.

Tests sit beside the files they cover -- `src/lib/aggregate.test.ts` next to
`src/lib/aggregate.ts` -- rather than in a mirrored tree, so a change and its
tests are always in one place. The two shared pieces that cannot belong to any
one directory live outside that rule: `vitest.setup.ts` at the root, next to the
config that names it, and `src/testing/fixtures.ts` for the chart-series
shorthand three of the suites use.

The suite is hermetic. Nothing reaches the network: `fetchDownloads` takes an
injected `fetchImpl`, the Worker's `caches` and `env` are stubbed, and the
component tests run against jsdom with the two browser APIs it lacks —
`matchMedia` and `ResizeObserver` — supplied by `vitest.setup.ts`. The retry
backoff is injectable (`retryBaseDelayMs`) so a failure path is asserted in
milliseconds instead of spending twelve seconds backing off.

`scripts/check-live.ts` is deliberately **not** part of the suite. It exists to
verify the things that only mean something against the real service: that the
chunked requests really do reassemble a full history, that the API still behaves
as the client assumes, and that a comparison including a scoped package works
end to end. It is slow and can earn a 429.

Two other scripts are tools rather than tests: `bench-cpu.ts` measures the embed
endpoint's cold-cache cost against the Workers 10ms budget, and `render-svg.ts`
writes sample charts to `/tmp/npmpulse-render` for eyeballing.

## Generated pages

Four families are written at build time from `data/downloads.json`:

|                                  |                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `/<package>`                     | one page per tracked package, with its whole record                                   |
| `/compare/a-vs-b`                | one per pair inside a group, with the month their positions last changed hands        |
| `/data/*`                        | 2015 against today, where npm's record begins, million-download days, fastest growing |
| `/packages`, `/compare`, `/data` | the indexes those hang from                                                           |

Every figure and every chart is in the HTML, so a crawler and a reader without
JavaScript both get them: the chart is inlined as SVG by the same renderer the
embed endpoint uses, and the series run through the same `prepareSeries` the
interactive chart does, so the two cannot state different numbers. The package
and comparison pages then hydrate the app's own chart over the static drawing —
`LiveChart.astro` — which covers it once mounted.

Everything comes from that one snapshot rather than a build-time fetch, which
keeps `pnpm build` offline and deterministic — CI builds without the network and
gets the same HTML every time — and leaves the figures behind a deployed page in
the repository rather than gone. `pnpm data:refresh` refetches it, in about a
dozen requests: the bulk endpoint takes 128 packages for 365 days at a time, so
the whole list fits in one batch across twelve chunks. A scheduled job wants to
run that, then commit and deploy, which is what keeps the pages current; nothing
else does it for you.

The list of packages is curated in `src/lib/packages.ts` rather than swept from
the registry, and the pairs come from the groups in the same file rather than
from the cross-product of everything. Pages that differ only by name are what
search engines treat as scaled content abuse; what makes these worth indexing is
the record since 2015, which no other download-chart site has.
`src/lib/routes.ts` is the single list of what exists, and the sitemap is
generated from it.

## Deploying

**Cloudflare** (`pnpm cf:deploy`) is the target the embed feature is built for.
It deploys two Workers: `npmpulse` serves the static build _and_ `/api/svg`, and
`npmpulse-www` (a three-line Worker, `wrangler.www.jsonc`) merely 301s
`www.npmpulse.com` to the apex. The site Worker stays out of the static path --
`run_worker_first` is `/api/*` -- so a page view is served from assets and never
metered.

**Any static host** (GitHub Pages, Netlify, S3) serves the site fine — the whole
chart pipeline runs in the browser against npm's CORS-enabled API. Only
`/api/svg` is missing, so embeds degrade to the "download SVG" button.

## URL parameters

Both endpoints read the same names, one spelling each:

| Parameter     | Values                                                               |
| ------------- | -------------------------------------------------------------------- |
| `q`           | packages, comma-separated, at most 8                                 |
| `range`       | `all`/`max`, `<n>d`/`<n>w`/`<n>m`/`<n>y`, or `YYYY-MM-DD:YYYY-MM-DD` |
| `granularity` | `daily` `weekly` `monthly` `yearly`                                  |
| `scale`       | `linear` `log`                                                       |
| `theme`       | `light` `dark`                                                       |

No other spelling is read: `packages=` and `g=` name nothing, so a URL has one
way to say each thing. The site additionally takes `#react,vue` as shorthand for
the package list, consulted only when the query names none.

`range` needs no separate case for the six quick ranges: `1m` is 30 days by
definition, so `<n><unit>` spells `1m` `3m` `6m` `1y` `5y` exactly as the
presets do, and `90d`, `2w` or `18m` are just as valid. A range the site can
name as a preset is written back as one, so `?range=90d` settles to `?range=3m`.

Five parameters belong to one endpoint each: `hide` to the site, which leaves
packages undrawn, and `title`, `unit`, `width` and `height` to the embed, which
describe the image it returns.

The default range is the one thing they answer differently, because their jobs
differ: `/` with no `range` shows five years, enough history to be interesting,
and `/api/svg` with none shows one year, which stays legible at 820px. An
unreadable `range` counts as no `range` on both, so a typo lands on that same
default rather than somewhere unexpected.

## Not built yet

- A scheduled refresh: `pnpm data:refresh` is manual, so the pages age until
  someone runs it.
- Anomaly flagging for the upstream spikes described above.
- Server-side rendering of the app shell: the island is `client:only`, so
  `index.html` carries no text content.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md)
for the setup, the checks CI runs, and how to add a package or a comparison.
This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE). Every source file carries that header, so a file
copied out of the repo still says where it came from: `pnpm license:add` stamps
new files and `pnpm license:check` — the gate CI runs — covers `.ts`, `.tsx` and
`.astro` alike.

`addlicense-ts` has no comment style for `.astro`, so `scripts/addlicense.mjs`
stamps those itself, writing the header inside the frontmatter fence. An HTML
comment above the fence would be emitted into every page's markup.
