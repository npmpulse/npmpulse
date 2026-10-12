/**
 * MIT License
 *
 * Copyright (c) 2026–Present Xiao Hanyu (https://xiaohanyu.me)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

import {
  ActionIcon,
  Anchor,
  Container,
  Divider,
  Group,
  MantineProvider,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'dayjs/locale/en'

import { type Granularity, prepareSeries } from '../lib/aggregate.ts'
import { normalizePackages, todayISO } from '../lib/npm-api.ts'
import { GRANULARITY_PARAM, PACKAGE_PARAM } from '../lib/params.ts'
import {
  type DateRange,
  defaultGranularity,
  detectPreset,
  type PresetKey,
  parseGranularity,
  parseRange,
  presetToRange,
} from '../lib/range.ts'
import { ChartExperience } from './ChartExperience.tsx'
import { PackageTags } from './Controls.tsx'
import type { ScaleKind } from './DownloadChart.tsx'
import { EmbedPanel } from './EmbedPanel.tsx'
import { LogoWithTitle } from './Logo.tsx'
import { MANTINE_THEME } from './mantine-theme.ts'
import { ShareRow } from './ShareRow.tsx'
import { useDownloads } from './useDownloads.ts'

/**
 * What a bare `/` shows.
 *
 * The landing page is not a separate view with its own hero: it renders a chart
 * like any other URL, and the chart it renders *is* the default state. That
 * makes `/` the canonical address of that state, and it means the URL only has
 * to carry what differs from it. Two packages rather than one because a single
 * series draws no legend, so the default would not show the legend toggle the
 * chart is built around; these two are within 1.05x of each other over five
 * years, which keeps both visible on a linear axis, and their lines cross.
 */
const DEFAULT_PACKAGES = ['react', 'lodash']
const DEFAULT_PRESET = '5y' as const

const MAX_PACKAGES = 8

/** Order matters: the series order decides which colour slot each package gets. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index])
}

function readInitialState() {
  if (typeof window === 'undefined') {
    return {
      packages: DEFAULT_PACKAGES,
      hidden: [] as string[],
      range: presetToRange(DEFAULT_PRESET),
      preset: DEFAULT_PRESET as PresetKey,
      granularity: null as Granularity | null,
      scale: 'linear' as ScaleKind,
      theme: null as 'light' | 'dark' | null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const fromHash = window.location.hash.replace(/^#/, '').split('&')[0]

  // The hash form is a shorthand for the same parameter, so it is consulted
  // only when the query carries no package list at all. Note that `params.get`
  // separates absent (null) from present-but-empty (''): a link with no
  // packages opens the worked example, while one the reader cleared stays
  // cleared.
  const explicit = params.get(PACKAGE_PARAM) ?? (fromHash || null)
  const packages =
    explicit === null
      ? DEFAULT_PACKAGES
      : normalizePackages([explicit]).slice(0, MAX_PACKAGES)

  const today = todayISO()
  // An unreadable range is treated exactly like an absent one and lands on the
  // default range, which is what a bare `/` shows.
  const range =
    parseRange(params.get('range'), today) ??
    presetToRange(DEFAULT_PRESET, today)

  // Null means "no preference" rather than "daily": the granularity is then
  // derived from the range, and stays derived as the reader changes it.
  const granularity = parseGranularity(params.get(GRANULARITY_PARAM))

  return {
    packages,
    hidden: (params.get('hide') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    range,
    preset: detectPreset(range, today),
    granularity,
    scale: (params.get('scale') === 'log' ? 'log' : 'linear') as ScaleKind,
    // Lets a link carry its theme, which also makes embeds reproducible.
    theme: (params.get('theme') === 'dark'
      ? 'dark'
      : params.get('theme') === 'light'
        ? 'light'
        : null) as 'light' | 'dark' | null,
  }
}

/**
 * The provider is rendered by this component, so the shell that calls
 * `useMantineColorScheme` has to be a child of it rather than the same one.
 */
export default function App() {
  const initial = useMemo(readInitialState, [])
  return (
    <MantineProvider
      theme={MANTINE_THEME}
      defaultColorScheme={initial.theme ?? 'auto'}
    >
      <DatesProvider settings={{ firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        <AppShell />
      </DatesProvider>
    </MantineProvider>
  )
}

function AppShell() {
  const initial = useMemo(readInitialState, [])
  const [packages, setPackages] = useState<string[]>(initial.packages)
  const [hidden, setHidden] = useState<string[]>(initial.hidden)
  const [range, setRange] = useState<DateRange>(initial.range)
  const [preset, setPreset] = useState<PresetKey>(initial.preset)
  const [granularityOverride, setGranularityOverride] =
    useState<Granularity | null>(initial.granularity)
  const [scale, setScale] = useState<ScaleKind>(initial.scale)
  const [reloadToken, setReloadToken] = useState(0)

  const granularity =
    granularityOverride ?? defaultGranularity(range.start, range.end)
  // The *resolved* scheme, not the stored preference. `useMantineColorScheme`
  // returns 'auto' while the provider is in auto mode, so reading it here made
  // every chart paint with the light palette on a dark page. `useComputedColorScheme`
  // is the scheme actually on screen.
  const colorScheme = useComputedColorScheme('light')

  // Hiding is view state, not data state: every package stays loaded so a
  // toggle redraws instantly instead of re-fetching.
  const visible = useMemo(
    () => packages.filter((name) => !hidden.includes(name)),
    [packages, hidden]
  )

  const { points, requests, loading, error, fromCache } = useDownloads({
    packages,
    start: range.start,
    end: range.end,
    reloadToken,
  })

  const prepared = useMemo(() => {
    const out: Record<string, ReturnType<typeof prepareSeries>> = {}
    for (const name of packages)
      out[name] = prepareSeries(points[name] ?? [], { granularity })
    return out
  }, [packages, points, granularity])

  // Every selected package, drawn or not. The chart is handed this whole list
  // and filters internally, for two reasons: the legend has to keep showing a
  // hidden package or there is no way to switch it back on, and colouring by
  // position in the visible list would repaint the survivors every time one was
  // hidden -- colour follows the package, not its rank.
  const allSeries = useMemo(
    () =>
      packages.map((name) => ({
        name,
        points: (prepared[name]?.points ?? []).map((point) => ({
          day: point.day,
          value: point.downloads,
        })),
      })),
    [packages, prepared]
  )

  const visibleSeries = useMemo(
    () => allSeries.filter((s) => !hidden.includes(s.name)),
    [allSeries, hidden]
  )

  // Each series carries its own days now, so there is no shared date column to
  // hand around; this is only "is there anything to chart".
  const hasData = visibleSeries.some((s) => s.points.length > 0)

  // One place builds the query, so the address bar and the share link can never
  // disagree about what the chart is.
  const searchParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('q', packages.join(','))
    params.set(
      'range',
      preset === 'custom' ? `${range.start}:${range.end}` : preset
    )
    if (granularityOverride) params.set(GRANULARITY_PARAM, granularityOverride)
    params.set('scale', scale)
    if (hidden.length) params.set('hide', hidden.join(','))
    params.set('theme', colorScheme)
    return params.toString()
  }, [packages, range, preset, granularityOverride, scale, hidden, colorScheme])

  // The theme the page opened with, i.e. the one a bare `/` resolves to. The
  // theme toggle is part of the state like everything else, so switching it is
  // a departure from the default and earns its place in the URL; leaving it
  // alone does not.
  const openingTheme = useRef(colorScheme).current

  const isDefaultState =
    sameNames(packages, DEFAULT_PACKAGES) &&
    hidden.length === 0 &&
    preset === DEFAULT_PRESET &&
    granularityOverride === null &&
    scale === 'linear' &&
    colorScheme === openingTheme

  // One rule, applied to every parameter: the URL carries what differs from the
  // default, and nothing when nothing does. A bare `/` is then the address of
  // the default state rather than a separate landing view -- which is what lets
  // it stay clean without a "has the reader touched anything" flag, and what
  // keeps it honest when a reader changes something and changes it back.
  const query = isDefaultState ? '' : `?${searchParams}`

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.history.replaceState(null, '', `${window.location.pathname}${query}`)
  }, [query])

  const shareUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${window.location.pathname}${query}`
  const shareTitle =
    visible.length > 0
      ? `${visible.join(' vs ')} — npm download history`
      : 'npm download history'

  const onPackagesChange = useCallback((next: string[]) => {
    // Normalise at the state boundary so `packages` -- which keys the chart, the
    // cache and the embed URL -- always matches what was fetched. An empty list
    // is a legitimate state: removing the last pill has to stick, or the field
    // cannot be cleared at all. Everything downstream already handles it -- the
    // chart says to enter a package, the table, share row and embed panel stand
    // down -- and the input itself stays on screen to type into.
    setPackages(normalizePackages(next).slice(0, MAX_PACKAGES))
  }, [])

  const onToggle = useCallback((name: string) => {
    setHidden((previous) =>
      previous.includes(name)
        ? previous.filter((n) => n !== name)
        : [...previous, name]
    )
  }, [])

  const onPreset = useCallback((key: PresetKey) => {
    if (key === 'custom') return
    setPreset(key)
    setRange(presetToRange(key))
  }, [])

  const onRange = useCallback((start: string, end: string) => {
    setRange({ start, end })
    setPreset(detectPreset({ start, end }))
  }, [])

  const hiddenSet = useMemo(
    () => new Set(hidden.filter((n) => packages.includes(n))),
    [hidden, packages]
  )

  return (
    <Container size="lg" py="lg">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <LogoWithTitle />
            <Text size="sm">
              Any npm package&apos;s download history, every day, back to 2015.
            </Text>
          </div>
          <ColorSchemeToggle />
        </Group>

        <PackageTags
          value={packages}
          loading={loading}
          error={error}
          onChange={onPackagesChange}
          onRefresh={() => setReloadToken((n) => n + 1)}
        />

        {/* The chart, its four controls, the figures table and the hygiene
            note, all from the one shared component the generated pages use
            too. Four controls are ~750px together, so they share one row on a
            wide screen and wrap on their own as the viewport narrows. */}
        <ChartExperience
          series={allSeries}
          granularity={granularity}
          onGranularity={setGranularityOverride}
          scale={scale}
          onScale={setScale}
          hidden={hiddenSet}
          onToggle={onToggle}
          loading={loading}
          error={error}
          range={range}
          preset={preset}
          onPreset={onPreset}
          onRange={onRange}
          requests={requests}
          fromCache={fromCache}
          hygiene={prepared[visible[0]]?.report ?? null}
        />

        <Divider />

        <ShareRow url={shareUrl} title={shareTitle} disabled={!hasData} />

        <EmbedPanel
          packages={visible}
          preset={preset}
          start={range.start}
          end={range.end}
          granularity={granularity}
          scale={scale}
          series={visibleSeries}
        />

        <Divider />
        <Text size="xs" c="dimmed">
          Download counts come from the public{' '}
          <Anchor
            href="https://github.com/npm/registry/blob/main/docs/download-counts.md"
            target="_blank"
            rel="noreferrer"
          >
            npm downloads API
          </Anchor>
          , which caps a single request at 549 days for one package and 365 for
          several — so npmpulse fetches the range in chunks and stitches them
          together. Counts are npm&apos;s own and include CI and mirror traffic.
        </Text>
      </Stack>
    </Container>
  )
}

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  // The scheme on screen, so the glyph and the label describe what is actually
  // being shown -- reading the stored preference said "auto" and mislabeled the
  // button, and the first click then set the scheme it already had.
  const colorScheme = useComputedColorScheme('light')
  const next = colorScheme === 'dark' ? 'light' : 'dark'
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={`Switch to ${next} theme`}
      onClick={() => setColorScheme(next)}
    >
      {colorScheme === 'dark' ? '☀' : '☾'}
    </ActionIcon>
  )
}
