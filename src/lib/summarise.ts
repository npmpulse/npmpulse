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
 * Daily points -> the `PackageSeries` a package page renders.
 *
 * This is the same reduction `pnpm data:refresh` runs to build the snapshot,
 * kept in `src/lib` so the dynamic package page (the 404 fallback for names the
 * snapshot does not track) can run it in the browser on freshly fetched points.
 * A dynamic page and a static one can therefore never disagree about what a
 * package's downloads are: both figures come out of `prepareSeries`.
 *
 * Pure module -- no DOM, no Node APIs.
 */

import { prepareSeries } from './aggregate.ts'
import { addDays, type DayPoint } from './npm-api.ts'
import type { PackageSeries } from './snapshot.ts'

/**
 * Long enough for the 90-day figures and a year-over-year one, short enough that
 * the snapshot stays reviewable. The full record is kept monthly instead.
 */
export const DAILY_WINDOW = 200

/** Days are contiguous when each one is the day after the last. */
function assertContiguousDays(days: readonly string[], what: string): void {
  for (let i = 1; i < days.length; i++) {
    if (addDays(days[i - 1], 1) !== days[i]) {
      throw new Error(`${what}: ${days[i]} does not follow ${days[i - 1]}`)
    }
  }
}

/**
 * Months are contiguous when each is the calendar month after the last. Checked
 * because both arrays are stored as bare values with a start date, and an index
 * into one of them is only a real date if this holds.
 */
function assertContiguousMonths(days: readonly string[], what: string): void {
  const index = (day: string) => {
    const [year, month] = day.split('-').map(Number)
    return year * 12 + month
  }
  for (let i = 1; i < days.length; i++) {
    if (index(days[i]) - index(days[i - 1]) !== 1) {
      throw new Error(`${what}: ${days[i]} does not follow ${days[i - 1]}`)
    }
  }
}

/** What a page needs, or null when the package is too young to have one. */
export function summarise(points: readonly DayPoint[]): PackageSeries | null {
  const daily = prepareSeries(points, { granularity: 'daily' })
  const monthly = prepareSeries(points, { granularity: 'monthly' })

  const { firstRealDay, lastRealDay } = daily.report
  if (!firstRealDay || !lastRealDay) return null
  // One month is a dot, not a history.
  if (monthly.points.length < 2) return null

  const firstDayDownloads = daily.points[0].downloads
  const window = daily.points.slice(-DAILY_WINDOW)
  const days = window.map((p) => p.day)
  const months = monthly.points.map((p) => p.day)
  assertContiguousDays(days, 'daily window')
  assertContiguousMonths(months, 'monthly series')

  return {
    firstDay: firstRealDay,
    firstDayDownloads,
    lastDay: lastRealDay,
    total: daily.points.reduce((sum, point) => sum + point.downloads, 0),
    monthlyStart: months[0],
    monthly: monthly.points.map((p) => p.downloads),
    dailyStart: days[0],
    daily: window.map((p) => p.downloads),
  }
}
