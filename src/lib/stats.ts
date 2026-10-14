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
 * The figures a package page states, derived from the snapshot.
 *
 * Everything here is a function of the snapshot alone -- no clock, no network --
 * which is what lets the pages be tested without one and rendered twice with the
 * same answer. Where a figure needs more history than a package has, it is null
 * and the caller leaves it out rather than showing a zero that would read as a
 * measurement.
 */

import { formatPeriod } from './format.ts'
import { dayAt, monthStart } from './npm-api.ts'
import type { PackageSeries } from './snapshot.ts'

export interface PackageStats {
  /** The day the trailing figures end on: the snapshot's last finalised day. */
  asOf: string
  /**
   * Null when the package's daily window is shorter than the period asked for.
   * The page leaves the row out rather than printing a zero, which would read as
   * a measured "no downloads" instead of "not enough history".
   */
  last7: number | null
  last30: number | null
  last90: number | null
  total: number
  bestMonth: { label: string; downloads: number }
  firstMonth: string
  months: number
  /**
   * The trailing twelve months against the twelve before them. Null until a
   * package has two full years to compare.
   */
  yearOverYear: number | null
}

/** Sum of the last `days` daily figures, or null when the window is shorter. */
function trailing(series: PackageSeries, days: number): number | null {
  if (series.daily.length < days) return null
  const window = series.daily.slice(-days)
  return window.reduce((sum, value) => sum + value, 0)
}

/** Sum of `count` months ending at `end` (an index into the monthly array). */
function months(
  series: PackageSeries,
  end: number,
  count: number
): number | null {
  const start = end - count
  if (start < 0) return null
  return series.monthly.slice(start, end).reduce((sum, v) => sum + v, 0)
}

export function statsFor(series: PackageSeries): PackageStats {
  const last = series.monthly.length - 1
  let bestIndex = 0
  for (let i = 1; i <= last; i++) {
    if (series.monthly[i] > series.monthly[bestIndex]) bestIndex = i
  }

  const thisYear = months(series, series.monthly.length, 12)
  const lastYear = months(series, series.monthly.length - 12, 12)

  return {
    asOf: series.lastDay,
    last7: trailing(series, 7),
    last30: trailing(series, 30),
    last90: trailing(series, 90),
    total: series.total,
    bestMonth: {
      label: formatPeriod(
        monthStart(series.monthlyStart, bestIndex),
        'monthly'
      ),
      downloads: series.monthly[bestIndex],
    },
    firstMonth: formatPeriod(series.monthlyStart, 'monthly'),
    months: series.monthly.length,
    yearOverYear:
      thisYear !== null && lastYear !== null && lastYear > 0
        ? thisYear / lastYear
        : null,
  }
}

/** Chart points for a package's full record, one per complete month. */
export function monthlyPoints(
  series: PackageSeries
): Array<{ day: string; value: number }> {
  return series.monthly.map((value, index) => ({
    day: monthStart(series.monthlyStart, index),
    value,
  }))
}

/** Chart points for the recent daily window. */
export function recentPoints(
  series: PackageSeries
): Array<{ day: string; value: number }> {
  return series.daily.map((value, index) => ({
    day: dayAt(series.dailyStart, index),
    value,
  }))
}

/**
 * Two series on one month axis.
 *
 * Months before a package's record begins count as zero, which is what the
 * trimming means: npm reported nothing for the name yet. Labelling them as gaps
 * instead would leave every comparison of a 2015 package with a 2020 one with
 * nothing to draw for half its width.
 */
export function alignedMonthly(
  a: PackageSeries,
  b: PackageSeries
): { months: string[]; a: number[]; b: number[] } {
  const start =
    a.monthlyStart < b.monthlyStart ? a.monthlyStart : b.monthlyStart
  const endA = monthStart(a.monthlyStart, a.monthly.length - 1)
  const endB = monthStart(b.monthlyStart, b.monthly.length - 1)
  const end = endA > endB ? endA : endB

  const index = (start_: string) => {
    const [y1, m1] = start.split('-').map(Number)
    const [y2, m2] = start_.split('-').map(Number)
    return y2 * 12 + m2 - (y1 * 12 + m1)
  }
  const offset = (series: PackageSeries) => index(series.monthlyStart)

  const months: string[] = []
  const left: number[] = []
  const right: number[] = []
  const width = index(end) + 1
  for (let i = 0; i < width; i++) {
    months.push(monthStart(start, i))
    const ai = i - offset(a)
    const bi = i - offset(b)
    left.push(ai >= 0 && ai < a.monthly.length ? a.monthly[ai] : 0)
    right.push(bi >= 0 && bi < b.monthly.length ? b.monthly[bi] : 0)
  }
  return { months, a: left, b: right }
}

export interface SeriesComparison {
  /** `b`'s trailing 90 days as a fraction of `a`'s, or null when either is short. */
  share: number | null
  /** Each side's trailing year against the year before it. */
  growth: { a: number | null; b: number | null }
  /** Who leads on the trailing twelve months. */
  leader: 'a' | 'b'
  /**
   * The last month the lead changed hands and who took it, or null when one side
   * has led throughout.
   *
   * A change has to hold for a second month to count. npm's figures contain
   * single-month spikes -- svelte's November 2022 is 5M downloads on a day that
   * normally sees 80K -- and taking one at face value had `react vs vue` claim a
   * crossing in January 2023, when vue's lead was a December that was ten times
   * its neighbours and nothing more.
   */
  crossing: { month: string; took: 'a' | 'b' } | null
  /** A linear axis would flatten one of the lines to nothing at this ratio. */
  log: boolean
}

export function compareSeries(
  a: PackageSeries,
  b: PackageSeries
): SeriesComparison {
  const statsA = statsFor(a)
  const statsB = statsFor(b)

  const share =
    statsA.last90 !== null && statsB.last90 !== null && statsA.last90 > 0
      ? statsB.last90 / statsA.last90
      : null

  const { months, a: left, b: right } = alignedMonthly(a, b)
  const trailing = (values: number[]) =>
    values.slice(-12).reduce((sum, v) => sum + v, 0)

  const yearA = trailing(left)
  const yearB = trailing(right)
  const leader: 'a' | 'b' = yearB > yearA ? 'b' : 'a'

  // Leadership as runs of consecutive months, so a one-month spike can be told
  // apart from a change of regime. A spike produces two changes -- into it and
  // out of it -- and neither is a crossing, which is why *both* neighbouring runs
  // have to be longer than a month.
  const runs: Array<{ took: 'a' | 'b'; from: number; to: number }> = []
  for (let i = 0; i < months.length; i++) {
    const took: 'a' | 'b' = left[i] >= right[i] ? 'a' : 'b'
    const last = runs.at(-1)
    if (last && last.took === took) last.to = i
    else runs.push({ took, from: i, to: i })
  }

  let crossing: { month: string; took: 'a' | 'b' } | null = null
  for (let i = 1; i < runs.length; i++) {
    const held = runs[i].to - runs[i].from >= 1
    const precededByARealLead = runs[i - 1].to - runs[i - 1].from >= 1
    if (held && precededByARealLead) {
      crossing = { month: months[runs[i].from], took: runs[i].took }
    }
  }

  const smaller = Math.min(yearA, yearB)
  const larger = Math.max(yearA, yearB)

  return {
    share,
    growth: { a: statsA.yearOverYear, b: statsB.yearOverYear },
    leader,
    crossing,
    // One line an order of magnitude under the other is a flat line at the axis,
    // which reads as "no downloads" rather than "fewer".
    log: smaller > 0 && larger / smaller > 50,
  }
}
