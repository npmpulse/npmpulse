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

/** Number and date formatting shared by the UI and the SVG embed renderer. */

/** 1234 -> "1.2K", 3_400_000 -> "3.4M". Used for axis ticks and stat tiles. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs < 1000) return String(Math.round(value))

  const units: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]

  for (const [scale, suffix] of units) {
    if (abs >= scale) {
      const scaled = value / scale
      // One decimal below 10 ("1.2M"), none above ("12M") -- keeps ticks short.
      const decimals = Math.abs(scaled) < 10 ? 1 : 0
      return `${scaled.toFixed(decimals).replace(/\.0$/, '')}${suffix}`
    }
  }
  return String(value)
}

/**
 * One figure as a share of another: "34%", "3.4%", or "1/244".
 *
 * Whole-number percent rounds anything under half a percent to "0%", which reads
 * as nothing at all rather than as something small -- astro against remix is
 * 1/244, not zero. Below one percent the fraction says how small.
 */
export function formatShare(value: number): string {
  if (value <= 0) return '0%'
  const percent = value * 100
  if (percent >= 10) return `${Math.round(percent)}%`
  if (percent >= 1) return `${percent.toFixed(1)}%`
  const denominator = Math.round(1 / value)
  return denominator <= 1000 ? `1/${denominator}` : 'under 0.1%'
}

/** 1234567 -> "1,234,567". */
export function formatFull(value: number): string {
  return value.toLocaleString('en-US')
}

export type { Granularity } from './aggregate.ts'

/**
 * The name of the period a day falls in, at whatever granularity is asked for:
 * "2026", "Mar 2026", "Week of 2026-03-04", or the day itself.
 *
 * Used to name the ends of the span the chart drew, where a month or a year is
 * the honest unit. That caller takes the daily and weekly branches as they come
 * -- for those the boundary really is a date -- so this stays the one place that
 * knows what a period is called at each granularity.
 */
export function formatPeriod(day: string, granularity: string): string {
  switch (granularity) {
    case 'yearly':
      return day.slice(0, 4)
    case 'monthly':
      return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
    case 'weekly':
      return `Week of ${day.slice(0, 4)}-${day.slice(5, 7)}-${day.slice(8, 10)}`
    default:
      return day
  }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Short label for an x-axis tick.
 *
 * `withYear` appends a two-digit year ("Mar 4 '25"). Both callers pass it for
 * every tick or for none, never for the tick where the year changes: the
 * thinning that decides which ticks are drawn happens after this point, so a
 * flag meaning "the year changed here" would land on points that never reach the
 * axis. `monthly` and `yearly` ignore it outright -- their labels already name
 * the year.
 */
export function formatTick(
  day: string,
  granularity: string,
  withYear = false
): string {
  const month = MONTHS[Number(day.slice(5, 7)) - 1]
  switch (granularity) {
    case 'yearly':
      return day.slice(0, 4)
    case 'monthly':
      return `${month} '${day.slice(2, 4)}`
    default:
      return `${month} ${Number(day.slice(8, 10))}${withYear ? ` '${day.slice(2, 4)}` : ''}`
  }
}
