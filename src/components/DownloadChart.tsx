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

import { LineChart } from '@mantine/charts'
import { Alert, Center, Loader, Stack, Text } from '@mantine/core'
import type { Granularity } from '../lib/aggregate.ts'
import { formatCompact, formatFull, formatTick } from '../lib/format.ts'
import { alignToAxis, type ChartSeries, chartAxis } from '../lib/svg-chart.ts'
import { DARK_THEME, LIGHT_THEME } from '../lib/theme.ts'

export type ScaleKind = 'linear' | 'log'

interface Props {
  /** Already aggregated to `granularity` -- the chart must not be handed raw
   *  daily points, or it silently draws a different series than the stats. */
  /**
   * *Every* selected package, not only the drawn ones. The legend is built from
   * this list so a hidden package keeps its entry and can be switched back on,
   * and colours are indexed here so hiding one never repaints the others.
   */
  series: ChartSeries[]
  granularity: Granularity
  scale: ScaleKind
  loading: boolean
  error: string | null
  colorScheme: 'light' | 'dark'
  /** Packages currently switched off; the chart draws only the rest. */
  hidden: ReadonlySet<string>
  onToggle: (name: string) => void
}

/**
 * Series keys are positional (`s0`, `s1`) with the real package name carried in
 * `label`. Mantine uses `name` as the data key, and npm package names can be
 * anything -- including `date`, which would collide with the x-axis key.
 *
 * One y-axis only. Recharts needs a positive, data-derived domain to switch to
 * a log scale, hence `allowDataOverflow`.
 */
export function DownloadChart({
  series,
  granularity,
  scale,
  loading,
  error,
  colorScheme,
  hidden,
  onToggle,
}: Props) {
  const theme = colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME

  if (error) {
    return (
      <Alert color="red" title="Could not load download data" radius="md">
        <Text size="sm">{error}</Text>
      </Alert>
    )
  }

  if (loading) {
    return (
      <Center h={360}>
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Fetching download history…
          </Text>
        </Stack>
      </Center>
    )
  }

  if (series.every((s) => s.points.length === 0)) {
    return (
      <Center h={360}>
        <Text c="dimmed" size="sm">
          {series.length === 0
            ? 'Enter a package name to see its download history.'
            : 'No download data for this range.'}
        </Text>
      </Center>
    )
  }

  // A package keeps its colour slot whether or not its neighbours are drawn,
  // so the slot is taken from the full list before anything is filtered out.
  const drawn = series
    .map((s, slot) => ({ name: s.name, points: s.points, slot }))
    .filter((s) => !hidden.has(s.name))

  // Series are lined up by date, not by array position. Their heads are trimmed
  // independently -- each starts where that package's records do -- so a package
  // published later has a shorter array, and indexing them all the same way
  // would draw its first day at the chart's start rather than its own.
  const axis = chartAxis(drawn)
  const rows = drawn.map((s) => ({ ...s, values: alignToAxis(s, axis) }))

  // Recharts thins x-axis labels itself, so a per-day "did the year change"
  // flag lands on points that are never rendered and the axis ends up with
  // bare "Mar 1" ticks across an 11-year range. Carry the year on every tick
  // whenever the visible span crosses a year boundary.
  const spansYears =
    axis.length > 1 && axis[0].slice(0, 4) !== axis[axis.length - 1].slice(0, 4)
  const withYear =
    (granularity === 'daily' || granularity === 'weekly') && spansYears

  // Keys are the index in the *full* list, so a package keeps the same data key
  // and the same colour slot whether or not its neighbours are drawn. Only
  // drawn keys are emitted; Recharts ignores the rest anyway.
  const data = axis.map((day, index) => {
    const row: Record<string, string | number | null> = {
      date: formatTick(day, granularity, withYear),
    }
    for (const s of rows) row[`s${s.slot}`] = s.values[index]
    return row
  })

  const chartSeries = rows.map((s) => ({
    name: `s${s.slot}`,
    label: s.name,
    color: theme.series[s.slot % theme.series.length],
  }))

  // Spanning several orders of magnitude, a linear axis flattens the early
  // history to nothing, so the log domain comes from the data itself.
  const positive = drawn
    .flatMap((s) => s.points.map((p) => p.value))
    .filter((v) => v > 0)
  const logDomain: [number, number] | undefined =
    scale === 'log' && positive.length > 0
      ? [
          10 ** Math.floor(Math.log10(Math.min(...positive))),
          10 ** Math.ceil(Math.log10(Math.max(...positive))),
        ]
      : undefined

  return (
    <div>
      {/*
        The legend is a sibling of the chart rather than Recharts' own legend
        slot. Reaching that slot means supplying `legendProps.content` and
        relying on Mantine spreading it *after* its built-in content -- an
        undocumented ordering read out of the compiled bundle, which a patch
        release could reverse, silently restoring Mantine's legend and dropping
        these toggles. Recharts also renders no legend at all under jsdom, so
        such a regression would be invisible to the tests. A plain row directly
        above the plot sits in the same place and is testable.

        Counted over every selected package, not just the drawn ones: hiding
        down to a single line must leave the legend on screen, or that line
        could never be brought back.
      */}
      {series.length > 1 && (
        <ToggleLegend
          series={series}
          colors={theme.series}
          hidden={hidden}
          onToggle={onToggle}
        />
      )}

      <LineChart
        h={360}
        data={data}
        dataKey="date"
        series={chartSeries}
        withLegend={false}
        withTooltip
        tooltipAnimationDuration={120}
        curveType="linear"
        strokeWidth={2}
        withDots={axis.length <= 40}
        activeDotProps={{ r: 4 }}
        valueFormatter={formatFull}
        yAxisProps={
          logDomain
            ? {
                scale: 'log',
                domain: logDomain,
                allowDataOverflow: true,
                tickFormatter: formatCompact,
              }
            : { domain: [0, 'auto'], tickFormatter: formatCompact }
        }
        gridAxis="y"
        gridProps={{ strokeDasharray: '0' }}
      />
    </div>
  )
}

interface ToggleLegendProps {
  series: ChartSeries[]
  colors: readonly string[]
  hidden: ReadonlySet<string>
  onToggle: (name: string) => void
}

/**
 * A legend that is also the control for what it labels.
 *
 * Clicking an entry to show or hide a line is what every charting library
 * trains, so this needs no heading and no explanatory caption. Hidden entries
 * stay in place and dim rather than disappearing -- removing one would
 * reshuffle the legend under the reader's cursor, and once it was gone there
 * would be nothing left to click to bring it back.
 */
export function ToggleLegend({
  series,
  colors,
  hidden,
  onToggle,
}: ToggleLegendProps) {
  const visibleCount = series.filter((s) => !hidden.has(s.name)).length

  return (
    <fieldset
      aria-label="Packages"
      style={{
        // A fieldset is the semantic grouping for a set of related controls,
        // which is what a legend row is; the browser's box needs clearing.
        border: 'none',
        margin: 0,
        padding: 0,
        minWidth: 0,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: '6px 16px',
        paddingBottom: 8,
      }}
    >
      {series.map((s, index) => {
        const color = colors[index % colors.length]
        const isHidden = hidden.has(s.name)
        // Never let the last visible line be switched off: an empty chart is
        // not a useful state and the control cannot be clicked back.
        const locked = !isHidden && visibleCount === 1
        const hint = locked
          ? `${s.name} must stay visible — a chart needs at least one line`
          : isHidden
            ? `Show ${s.name}`
            : `Hide ${s.name}`

        return (
          <button
            key={s.name}
            type="button"
            onClick={() => onToggle(s.name)}
            disabled={locked}
            aria-pressed={!isHidden}
            aria-label={hint}
            title={hint}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              font: 'inherit',
              color: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: locked ? 'default' : 'pointer',
              opacity: isHidden ? 0.4 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: isHidden ? 'transparent' : color,
                border: `2px solid ${color}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                textDecoration: isHidden ? 'line-through' : 'none',
              }}
            >
              {s.name}
            </span>
          </button>
        )
      })}
    </fieldset>
  )
}
