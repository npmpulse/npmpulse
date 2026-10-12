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

import { useComputedColorScheme } from '@mantine/core'
import { useMemo } from 'react'
import type { Granularity, HygieneReport } from '../lib/aggregate.ts'
import type { DateRange, PresetKey } from '../lib/range.ts'
import { type ChartSeries, chartAxis } from '../lib/svg-chart.ts'
import { DARK_THEME, LIGHT_THEME } from '../lib/theme.ts'
import { ChartPanel } from './ChartPanel.tsx'
import type { ScaleKind } from './DownloadChart.tsx'
import { HygieneNote } from './HygieneNote.tsx'
import { CustomRangePicker, drawnSpan, RangePresets } from './RangeControls.tsx'
import { type PackageStat, StatsPanel } from './StatsPanel.tsx'

/**
 * The whole chart block: the chart, the four controls, the figures table and the
 * hygiene note.
 *
 * The landing page and the generated pages had this wired separately, and they
 * drifted: the generated pages offered two granularities where the app offered
 * four, had no range controls, and framed the chart differently. One component,
 * controlled from outside, is what stops that happening again. Each caller owns
 * its own state -- the app keeps it in the URL, a generated page keeps it in the
 * island -- and hands the same values in.
 *
 * The colour scheme and the derived values both callers were computing for
 * themselves -- which packages are drawn, the span that was drawn, and the
 * per-package figures -- are worked out here, once.
 */
export interface ChartExperienceProps {
  /** Every selected package, already aggregated to `granularity`, drawn or not. */
  series: ChartSeries[]
  granularity: Granularity
  onGranularity: (value: Granularity) => void
  /** Which granularities to offer. Omitted means all four. */
  granularities?: readonly Granularity[]
  scale: ScaleKind
  onScale: (value: ScaleKind) => void
  hidden: ReadonlySet<string>
  onToggle: (name: string) => void
  loading?: boolean
  error?: string | null
  range: DateRange
  preset: PresetKey
  onPreset: (key: PresetKey) => void
  onRange: (start: string, end: string) => void
  /** Latest day the range picker may offer. Defaults to today. */
  maxDate?: string
  /** How many requests the figures took, or null when the source is not a fetch. */
  requests?: number | null
  fromCache?: boolean
  hygiene?: HygieneReport | null
}

export function ChartExperience({
  series,
  granularity,
  onGranularity,
  granularities,
  scale,
  onScale,
  hidden,
  onToggle,
  loading,
  error,
  range,
  preset,
  onPreset,
  onRange,
  maxDate,
  requests = null,
  fromCache = false,
  hygiene,
}: ChartExperienceProps) {
  // The resolved scheme, not the stored 'auto', so a dark page is drawn with the
  // dark series palette rather than the light one.
  const colorScheme = useComputedColorScheme('light')
  const theme = colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME

  const visible = useMemo(
    () => series.filter((entry) => !hidden.has(entry.name)),
    [series, hidden]
  )
  const hasData = visible.some((entry) => entry.points.length > 0)

  // The union of days actually drawn, from the same helper both renderers use,
  // so the span the readout names cannot disagree with the picture.
  const axis = useMemo(() => chartAxis(visible), [visible])

  const stats = useMemo<PackageStat[]>(
    () =>
      visible.map((entry) => ({
        name: entry.name,
        total: entry.points.reduce((sum, point) => sum + point.value, 0),
        latest: entry.points[entry.points.length - 1]?.value ?? 0,
        peak:
          entry.points.length > 0
            ? Math.max(...entry.points.map((point) => point.value))
            : 0,
        periods: entry.points.length,
      })),
    [visible]
  )

  return (
    <>
      <ChartPanel
        series={series}
        granularity={granularity}
        onGranularity={onGranularity}
        granularities={granularities}
        scale={scale}
        onScale={onScale}
        hidden={hidden}
        onToggle={onToggle}
        loading={loading}
        error={error}
        caption={
          axis.length > 0
            ? drawnSpan(axis[0], axis[axis.length - 1], granularity)
            : undefined
        }
      >
        <RangePresets preset={preset} onPreset={onPreset} />
        <CustomRangePicker
          start={range.start}
          end={range.end}
          onRange={onRange}
          maxDate={maxDate}
        />
      </ChartPanel>

      {/* The figures sit under the chart rather than above it: with eight
          packages the table is tall enough to push the chart itself below the
          fold, and the chart is the thing being read. */}
      {stats.length > 0 && hasData && (
        <StatsPanel
          stats={stats}
          theme={theme}
          granularity={granularity}
          requests={requests}
          fromCache={fromCache}
        />
      )}

      {hygiene && <HygieneNote report={hygiene} />}
    </>
  )
}
