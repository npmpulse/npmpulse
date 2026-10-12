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

import { Group, Stack, Text, useComputedColorScheme } from '@mantine/core'
import type { ReactNode } from 'react'
import type { Granularity } from '../lib/aggregate.ts'
import type { ChartSeries } from '../lib/svg-chart.ts'
import { GranularityToggle, ScaleToggle } from './Controls.tsx'
import { DownloadChart, type ScaleKind } from './DownloadChart.tsx'

/**
 * The chart and the controls that belong to it.
 *
 * One component, so the app and the generated pages cannot drift apart in the way
 * the chart is framed -- which they had: the app reserved room for the chart
 * before it arrived and the generated pages did not, and their control rows were
 * spaced differently.
 *
 * It holds no data and no state. The app keeps its granularity, scale and hidden
 * series in the URL and passes them in; the generated pages keep theirs in local
 * state and pass those. What is shared is the arrangement, and the colour scheme,
 * from Mantine.
 */

/**
 * Reserved whether or not there is a chart yet, so nothing jumps when one arrives
 * or when the reader switches granularity.
 */
const CHART_MIN_HEIGHT = 360

interface Props {
  /** Every selected package, already aggregated to `granularity`. */
  series: ChartSeries[]
  granularity: Granularity
  onGranularity: (value: Granularity) => void
  scale: ScaleKind
  onScale: (value: ScaleKind) => void
  hidden: ReadonlySet<string>
  onToggle: (name: string) => void
  /** Which granularities to offer. Omitted means all four. */
  granularities?: readonly Granularity[]
  loading?: boolean
  error?: string | null
  /** A line between the controls and the chart, naming what is drawn. */
  caption?: string
  /** Further controls for the same row, after the two the panel draws. */
  children?: ReactNode
}

export function ChartPanel({
  series,
  granularity,
  onGranularity,
  scale,
  onScale,
  hidden,
  onToggle,
  granularities,
  loading = false,
  error = null,
  caption,
  children,
}: Props) {
  // The resolved scheme, not the stored 'auto', so a dark page is handed the
  // dark series palette instead of the light one.
  const colorScheme = useComputedColorScheme('light')

  return (
    <Stack gap="md">
      <Group align="flex-end" gap="lg" wrap="wrap">
        <GranularityToggle
          value={granularity}
          onChange={onGranularity}
          granularities={granularities}
        />
        <ScaleToggle value={scale} onChange={onScale} />
        {children}
      </Group>

      {caption ? (
        <Text size="xs" c="dimmed">
          {caption}
        </Text>
      ) : null}

      <div style={{ minHeight: CHART_MIN_HEIGHT }}>
        <DownloadChart
          series={series}
          granularity={granularity}
          scale={scale}
          loading={loading}
          error={error}
          colorScheme={colorScheme}
          hidden={hidden}
          onToggle={onToggle}
        />
      </div>
    </Stack>
  )
}
