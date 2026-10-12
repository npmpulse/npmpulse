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

import { addDays } from '../lib/npm-api.ts'
import type { PackageSeries } from '../lib/snapshot.ts'
import type {
  ChartInput,
  ChartSeries,
  RenderOptions,
} from '../lib/svg-chart.ts'
import { renderChart } from '../lib/svg-chart.ts'

/** Consecutive days from `start`. */
export const daysFrom = (start: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => addDays(start, i))

export const rising = (count: number, from = 100, step = 10): number[] =>
  Array.from({ length: count }, (_, i) => from + i * step)

/**
 * Tests describe a chart as a shared day list plus one value per series, which
 * is the convenient way to write them and reads clearly. The renderer takes
 * something stricter -- each series carries its own points -- because a series
 * may not cover the whole span. A null here means "this package has no data
 * that day", which is what the trimmed head of a newer package looks like.
 */
export interface LegacySeries {
  name: string
  values: Array<number | null>
}

export interface LegacyInput {
  dates: string[]
  series: LegacySeries[]
}

export function toChartInput({ dates, series }: LegacyInput): ChartInput {
  return {
    series: series.map((s) => ({
      name: s.name,
      points: dates.flatMap((day, index) => {
        const value = s.values[index]
        return value === null || value === undefined ? [] : [{ day, value }]
      }),
    })),
  }
}

/** `renderChart` for the shorthand above. */
export const render = (input: LegacyInput, options?: RenderOptions): string =>
  renderChart(toChartInput(input), options)

/** The same shorthand as a `ChartSeries[]`, for component props. */
export const seriesOf = ({ dates, series }: LegacyInput): ChartSeries[] =>
  toChartInput({ dates, series }).series

/**
 * A snapshot series, for the tests that derive figures from one. Defaults to two
 * steady years, which is the smallest shape that has a year-over-year figure at
 * all, so a test that only cares about one field can say so and leave the rest.
 */
export function seriesFixture(
  over: Partial<PackageSeries> = {}
): PackageSeries {
  const months = 24
  return {
    firstDay: '2024-11-01',
    firstDayDownloads: 5,
    lastDay: '2026-10-11',
    total: months * 1000,
    monthlyStart: '2024-11-01',
    monthly: Array.from({ length: months }, () => 1000),
    dailyStart: '2026-03-26',
    daily: Array.from({ length: 200 }, () => 10),
    ...over,
  }
}
