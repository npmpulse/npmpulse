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
 * The rankings the data pages are built from.
 *
 * Every one of them is a function of the snapshot and the tracked-package list,
 * so the pages are testable without a network and state the same thing on every
 * build. Each ranking says which packages it looked at, because a ranking of a
 * curated set is not a ranking of npm: "the fastest growing package" here means
 * the fastest growing among the ones this site tracks, and the pages say so.
 */

import { formatPeriod } from './format.ts'
import type { PackageSeries } from './snapshot.ts'
import { monthStart } from './snapshot.ts'

/** Sum of `count` months from the month starting `from`, or null if not covered. */
export function windowSum(
  series: PackageSeries,
  from: string,
  count: number
): number | null {
  const start = series.monthlyStart
  const index = (month: string) => {
    const [y1, m1] = start.split('-').map(Number)
    const [y2, m2] = month.split('-').map(Number)
    return y2 * 12 + m2 - (y1 * 12 + m1)
  }
  const first = index(from)
  if (first < 0 || first + count > series.monthly.length) return null
  return series.monthly.slice(first, first + count).reduce((s, v) => s + v, 0)
}

export interface ThenAndNow {
  name: string
  /**
   * The ten months of 2015 npm's record covers, and the same ten of 2025.
   *
   * `before` and `after` rather than `then` and `now`: a property called `then`
   * makes the object look thenable, so `await` on one would try to call it.
   */
  before: number
  after: number
  multiple: number
}

/**
 * March to December, in 2015 and in 2025.
 *
 * Those ten months rather than a calendar year, because npm's record begins on
 * 2015-02-27 and its first complete month is March: comparing ten months with
 * twelve would fold a fifth of a year into the answer.
 */
export const WINDOW_FROM = '2015-03-01'
export const WINDOW_TO = '2025-03-01'
export const WINDOW_MONTHS = 10

export function thenAndNow(
  packages: Record<string, PackageSeries>
): ThenAndNow[] {
  const rows: ThenAndNow[] = []
  for (const [name, series] of Object.entries(packages)) {
    const before = windowSum(series, WINDOW_FROM, WINDOW_MONTHS)
    const after = windowSum(series, WINDOW_TO, WINDOW_MONTHS)
    if (before === null || after === null || before <= 0) continue
    rows.push({ name, before, after, multiple: after / before })
  }
  return rows.sort((x, y) => y.multiple - x.multiple)
}

export interface RecordStart {
  name: string
  firstDay: string
  firstDayDownloads: number
}

/** npm's own first day with real figures, and the day every older record starts. */
export const NPM_FIRST_REAL_DAY = '2015-02-27'

/**
 * Where each package's record begins, oldest first.
 *
 * The interesting split is between the packages whose record starts on npm's
 * first real day -- meaning they existed before npm measured anything -- and the
 * ones that arrive later, where the first day's volume says whether that was a
 * launch or a name with an earlier life.
 */
export function recordStarts(
  packages: Record<string, PackageSeries>
): RecordStart[] {
  return Object.entries(packages)
    .map(([name, series]) => ({
      name,
      firstDay: series.firstDay,
      firstDayDownloads: series.firstDayDownloads,
    }))
    .sort((x, y) =>
      x.firstDay === y.firstDay
        ? y.firstDayDownloads - x.firstDayDownloads
        : x.firstDay.localeCompare(y.firstDay)
    )
}

export interface Growth {
  name: string
  /** The trailing twelve months against the twelve before them. */
  multiple: number
  before: number
  after: number
}

/**
 * Growth over the trailing year, among packages big enough for it to mean
 * something.
 *
 * The floor matters: a package that went from a thousand downloads a year to a
 * hundred thousand multiplies by a hundred and tells a reader nothing, and a list
 * topped by those is a list of the smallest packages on the site. Anything under
 * `minBefore` in the earlier year is left out, and the page says what the floor
 * was.
 */
export function fastestGrowing(
  packages: Record<string, PackageSeries>,
  minBefore = 10_000_000
): Growth[] {
  const rows: Growth[] = []
  for (const [name, series] of Object.entries(packages)) {
    const count = series.monthly.length
    if (count < 24) continue
    const before = series.monthly.slice(-24, -12).reduce((s, v) => s + v, 0)
    const after = series.monthly.slice(-12).reduce((s, v) => s + v, 0)
    if (before < minBefore) continue
    rows.push({ name, multiple: after / before, before, after })
  }
  return rows.sort((x, y) => y.multiple - x.multiple)
}

/** 'Mar 2015 – Dec 2015', for labelling a window. */
export function windowLabel(from: string, count: number): string {
  const first = formatPeriod(from, 'monthly')
  const last = formatPeriod(monthStart(from, count - 1), 'monthly')
  return `${first} – ${last}`
}
