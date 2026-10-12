# Contributing

Thanks for taking a look. npmpulse is a small, deliberately boring codebase:
pure functions for everything, tests beside the code they cover, and a build
that runs offline. The fastest way in is to read the "Architecture" and "Data
quirks" sections of the [README](./README.md) first — most of the design exists
to work around real properties of npm's downloads API.

## Getting set up

```bash
pnpm install        # also installs the lefthook git hooks via `prepare`
pnpm dev            # the site on :4321
pnpm dev:api        # the embed Worker on :8787, in another shell
```

Node 24 is what CI runs; recent LTS releases work. pnpm is the package manager
(the lockfile is `pnpm-lock.yaml`).

## The checks CI runs

Run these before opening a pull request — they are exactly what CI gates on:

```bash
pnpm check          # biome lint + tsc --noEmit + license:check
pnpm test:cov       # vitest with coverage; the thresholds fail the run
pnpm build          # astro build, offline
pnpm check:live     # optional, network: verifies the API assumptions against the real service
```

`pnpm check:live` is intentionally slow and can earn a `429`; it is not part of
the suite.

## Conventions

- **Formatting and linting.** Biome owns code (`.ts`, `.tsx`, `.json`, …) and
  prettier owns prose (`*.md`). Don't run one over the other's files.
  `pnpm lint:fix` and `pnpm format` apply the fixes.
- **License headers.** Every `.ts`, `.tsx` and `.astro` file carries the MIT
  header. `pnpm license:add` stamps new files; `pnpm license:check` — the gate
  CI runs — fails on a file that was never stamped.
- **Tests live beside the code** (`src/lib/aggregate.test.ts` next to
  `src/lib/aggregate.ts`), not in a mirrored tree. Component tests opt into
  jsdom with a `// @vitest-environment jsdom` docblock.
- **Coverage thresholds** (90% statements/lines/functions, 85% branches) are in
  `vitest.config.ts` and fail the run. Keep the floor rather than lowering it.
- **Comments explain why.** The codebase is heavy on comments that record the
  reason a non-obvious decision was made; that is deliberate.

## Adding a package or a comparison

Both live in `src/lib/packages.ts`:

1. Add the name to a group in `GROUPS` (a group is capped at four — every group
   of `n` produces `n(n-1)/2` comparison pages) or to `SOLO_PACKAGES` for a
   package tracked on its own.
2. `pnpm data:refresh` to fetch its history into `data/downloads.json`, and
   commit that file.
3. `pnpm build` — the package page, its comparison pages, the index pages and
   the sitemap all generate from those two files.

## Commits and pull requests

- Commit messages follow
  [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, …); commitlint enforces it on the message.
- Keep a pull request to one concern, and say what it changes and why. If it
  touches the data pipeline, note which of the quirks in the README you checked
  against.
- New behaviour wants a test, and a fixed bug wants the test that would have
  caught it.

## Reporting bugs and security issues

Open an issue for a bug or a feature request. For anything security-sensitive,
email xiaohanyu1988@gmail.com rather than opening a public issue.
