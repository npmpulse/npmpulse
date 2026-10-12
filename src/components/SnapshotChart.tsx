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

/**
 * The interactive chart, on a page that already has the figures in its HTML.
 *
 * It draws from the committed snapshot rather than the network: the page is a
 * static artefact and must not start making requests when it hydrates. That
 * constrains the data -- `data/downloads.json` holds complete calendar months
 * for the whole record and only the last few hundred days at daily resolution --
 * so daily and weekly views are offered only across the recent window, and the
 * full record is read at monthly and yearly. `ChartExperience` is the same
 * component the landing page renders, so the controls, the figures table and the
 * framing do not drift from the app's.
 *
 * Range presets are anchored to the snapshot's last day, not to today: the
 * figures end there, so "1M" means the last month of the record rather than the
 * last month before a page was opened.
 */

import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { useLayoutEffect, useMemo, useState } from 'react'
import 'dayjs/locale/en'

import { aggregate, type Granularity } from '../lib/aggregate.ts'
import {
  type DateRange,
  defaultGranularity,
  detectPreset,
  type PresetKey,
  presetToRange,
} from '../lib/range.ts'
import type { ChartPoint } from '../lib/svg-chart.ts'
import { ChartExperience } from './ChartExperience.tsx'
import type { ScaleKind } from './DownloadChart.tsx'
import { MANTINE_THEME } from './mantine-theme.ts'

export interface SnapshotSeries {
  name: string
  /** Complete calendar months, oldest first. */
  monthly: ChartPoint[]
  /** Recent days, oldest first. Empty when the snapshot has none for the name. */
  daily: ChartPoint[]
}

interface Props {
  series: SnapshotSeries[]
  /** The day the snapshot's figures end on. Presets are anchored here, not today. */
  asOf: string
  initialScale?: ScaleKind
}

const DAILY_GRANULARITIES: readonly Granularity[] = ['daily', 'weekly']

/** Points whose day falls inside the window, at the window's own resolution. */
function clipToRange(
  points: ChartPoint[],
  range: DateRange,
  monthly: boolean
): ChartPoint[] {
  if (monthly) {
    const from = `${range.start.slice(0, 7)}-01`
    return points.filter((point) => point.day >= from && point.day <= range.end)
  }
  return points.filter(
    (point) => point.day >= range.start && point.day <= range.end
  )
}

function Chart({ series, asOf, initialScale = 'linear' }: Props) {
  const [preset, setPreset] = useState<PresetKey>('all')
  const [range, setRange] = useState<DateRange>(() =>
    presetToRange('all', asOf)
  )
  const [granularityOverride, setGranularityOverride] =
    useState<Granularity | null>(null)
  const [scale, setScale] = useState<ScaleKind>(initialScale)
  const [hidden, setHidden] = useState<readonly string[]>([])

  // The snapshot keeps only a recent daily window, so its extent decides which
  // granularities and presets are honest. Taken as the widest window any series
  // holds.
  const dailyWindow = useMemo(() => {
    const starts = series
      .map((s) => s.daily[0]?.day)
      .filter((day): day is string => Boolean(day))
    const ends = series
      .map((s) => s.daily[s.daily.length - 1]?.day)
      .filter((day): day is string => Boolean(day))
    if (starts.length === 0 || ends.length === 0) return null
    return {
      start: starts.reduce((a, b) => (a < b ? a : b)),
      end: ends.reduce((a, b) => (a > b ? a : b)),
    }
  }, [series])

  const rangeWithinDaily =
    dailyWindow !== null &&
    range.start >= dailyWindow.start &&
    range.end <= dailyWindow.end

  const granularities: readonly Granularity[] = rangeWithinDaily
    ? ['daily', 'weekly', 'monthly']
    : ['monthly', 'yearly']

  // The full record is read monthly, as the page's own static chart is, rather
  // than the yearly `defaultGranularity` would pick -- so the hydrated chart is
  // the same picture the no-JavaScript reader gets.
  const derived = rangeWithinDaily
    ? defaultGranularity(range.start, range.end)
    : 'monthly'
  const granularity =
    granularityOverride && granularities.includes(granularityOverride)
      ? granularityOverride
      : derived

  const chartSeries = useMemo(
    () =>
      series.map((entry) => {
        const atDaily =
          rangeWithinDaily && DAILY_GRANULARITIES.includes(granularity)
        const source = atDaily ? entry.daily : entry.monthly
        const clipped = clipToRange(source, range, !atDaily)
        // The snapshot's monthly points are already complete calendar months, so
        // a monthly view takes them as they are. Re-aggregating would treat the
        // final month as unfinished and drop it -- 842M for react -- which made
        // the figures table below disagree with the page above it (11B against
        // 12B, 138 months against 139). Yearly and the daily roll-ups still go
        // through `aggregate`, which is what drops a genuinely partial period.
        const points =
          !atDaily && granularity === 'monthly'
            ? clipped
            : aggregate(
                clipped.map((point) => ({
                  day: point.day,
                  downloads: point.value,
                })),
                granularity
              ).map((point) => ({ day: point.day, value: point.downloads }))
        return { name: entry.name, points }
      }),
    [series, granularity, range, rangeWithinDaily]
  )

  const hiddenSet = useMemo(() => new Set(hidden), [hidden])

  return (
    <ChartExperience
      series={chartSeries}
      granularity={granularity}
      onGranularity={setGranularityOverride}
      granularities={granularities}
      scale={scale}
      onScale={setScale}
      hidden={hiddenSet}
      onToggle={(name) =>
        setHidden((current) =>
          current.includes(name)
            ? current.filter((entry) => entry !== name)
            : [...current, name]
        )
      }
      range={range}
      preset={preset}
      onPreset={(key) => {
        if (key === 'custom') return
        setPreset(key)
        setRange(presetToRange(key, asOf))
      }}
      onRange={(start, end) => {
        setRange({ start, end })
        setPreset(detectPreset({ start, end }, asOf))
      }}
      maxDate={asOf}
    />
  )
}

export default function SnapshotChart(props: Props) {
  // Tells the stylesheet in `LiveChart.astro` that the live chart is here, so it
  // can take the static one out of the flow. Until this runs, and forever for a
  // reader without JavaScript, the static chart is what is on screen. A layout
  // effect so the swap happens before the frame is painted.
  useLayoutEffect(() => {
    document.documentElement.dataset.liveChart = 'ready'
  }, [])

  return (
    <MantineProvider theme={MANTINE_THEME} defaultColorScheme="auto">
      <DatesProvider settings={{ firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        <Chart {...props} />
      </DatesProvider>
    </MantineProvider>
  )
}
