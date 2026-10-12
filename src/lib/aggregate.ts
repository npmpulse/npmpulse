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
 * Series transforms: raw daily points -> a chartable series.
 *
 * Three data-quality problems come from the upstream API, and all three have
 * to be handled before anything is drawn:
 *
 *  1. npm advertises records from 2015-01-10, but every package reports 0 for
 *     the first weeks -- real values begin later, and the gap differs per
 *     package (packages published after 2015 naturally start even later). A
 *     package published in 2020 would otherwise render as five years of flat
 *     zero followed by a sudden climb.
 *  2. The most recent 1-2 days are always 0: npm has not finalised them yet.
 *     Left alone, every chart ends in a cliff.
 *  3. Individual days are occasionally 0 across *all* packages at once, when
 *     npm loses that day's logs. For a package with millions of daily
 *     downloads a 0 is missing data, not a reading.
 *
 * We trim the leading and trailing gaps, and interpolate interior gaps that
 * real data bounds on both sides. Every change is counted and reported so the
 * UI can disclose what was touched rather than quietly editing the data.
 *
 * Pure module -- no DOM, no Node APIs. Shared by the browser and the Worker.
 */

import { addDays, type DayPoint, parseDay } from './npm-api.ts'

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'yearly'

export const GRANULARITIES: readonly Granularity[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
]

export interface HygieneReport {
  /** Leading days dropped: no records existed for the package yet. */
  trimmedHead: number
  /** Trailing days dropped: upstream had not finalised them. */
  trimmedTail: number
  /** Interior missing days filled by linear interpolation. */
  filledGaps: number
  /** First day with real data, after trimming. */
  firstRealDay: string | null
  /** Last day with real data, after trimming. */
  lastRealDay: string | null
}

/* --------------------------------------------------------------- hygiene */

/**
 * Drop leading zero-days. Before a package is published the API reports 0
 * rather than omitting the day, so an untrimmed series opens with a flat run
 * that never happened.
 */
export function trimMissingHead(points: readonly DayPoint[]): {
  points: DayPoint[]
  removed: number
} {
  let start = 0
  while (start < points.length && points[start].downloads === 0) start++
  return { points: points.slice(start), removed: start }
}

/**
 * Drop trailing zero-days. The tail of npm's series is reliably 0 for the
 * current (and usually previous) UTC day, which is absence of data rather
 * than a measurement.
 */
export function trimMissingTail(points: readonly DayPoint[]): {
  points: DayPoint[]
  removed: number
} {
  let end = points.length
  while (end > 0 && points[end - 1].downloads === 0) end--
  return { points: points.slice(0, end), removed: points.length - end }
}

/**
 * Fill runs of zero that sit between two non-zero readings.
 *
 * A run touching either end is deliberately left alone: at the head there is
 * genuinely nothing before it, and at the tail the trim step has already dealt
 * with it. Filling only bounded gaps means we never invent data where none
 * could exist.
 */
export function fillInteriorGaps(points: readonly DayPoint[]): {
  points: DayPoint[]
  filled: number
} {
  if (points.length < 3)
    return { points: points.map((p) => ({ ...p })), filled: 0 }

  const out = points.map((p) => ({ ...p }))
  let filled = 0
  let i = 1

  while (i < out.length - 1) {
    if (out[i].downloads !== 0) {
      i++
      continue
    }

    // Measure the run of zeros starting at i.
    let runEnd = i
    while (runEnd < out.length && out[runEnd].downloads === 0) runEnd++

    const before = out[i - 1]
    const after = out[runEnd]

    if (before.downloads > 0 && runEnd < out.length && after.downloads > 0) {
      const runLength = runEnd - i
      for (let k = 0; k < runLength; k++) {
        const ratio = (k + 1) / (runLength + 1)
        out[i + k].downloads = Math.round(
          before.downloads + (after.downloads - before.downloads) * ratio
        )
        filled++
      }
    }
    i = runEnd
  }

  return { points: out, filled }
}

/* ------------------------------------------------------------ aggregation */

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const dayOfWeek = (parseDay(day).getUTCDay() + 6) % 7 // 0 = Monday
  return addDays(day, -dayOfWeek)
}

/** The calendar period a day belongs to, plus that period's natural final day. */
function periodOf(
  day: string,
  granularity: Granularity
): {
  key: string
  naturalStart: string
  naturalEnd: string
} {
  switch (granularity) {
    case 'weekly': {
      const start = weekStart(day)
      return { key: start, naturalStart: start, naturalEnd: addDays(start, 6) }
    }
    case 'monthly': {
      const year = Number(day.slice(0, 4))
      const month = Number(day.slice(5, 7))
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const key = `${day.slice(0, 7)}-01`
      return {
        key,
        naturalStart: key,
        naturalEnd: `${day.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    case 'yearly': {
      const key = `${day.slice(0, 4)}-01-01`
      return { key, naturalStart: key, naturalEnd: `${day.slice(0, 4)}-12-31` }
    }
    default:
      return { key: day, naturalStart: day, naturalEnd: day }
  }
}

/**
 * Roll daily points up to the requested granularity.
 *
 * Periods are summed and labelled by their first day. A trailing period the
 * data does not fully cover is dropped by default: an October with 10 of 31
 * days sums to a third of a real month, and a 2026 with 10 of 12 months sits
 * next to full years -- both read as collapses rather than as partial data.
 * The exception is when dropping would leave nothing to draw, in which case
 * the partial period is kept.
 */
export function aggregate(
  points: readonly DayPoint[],
  granularity: Granularity,
  options: {
    dropIncompleteTrailing?: boolean
    dropIncompleteLeading?: boolean
  } = {}
): DayPoint[] {
  if (granularity === 'daily') return points.map((p) => ({ ...p }))
  if (points.length === 0) return []

  const dropIncomplete = options.dropIncompleteTrailing ?? true
  const dropLeading = options.dropIncompleteLeading ?? true
  const firstDataDay = points[0].day
  const lastDataDay = points[points.length - 1].day

  const totals = new Map<
    string,
    { downloads: number; naturalStart: string; naturalEnd: string }
  >()
  const order: string[] = []

  for (const point of points) {
    const { key, naturalStart, naturalEnd } = periodOf(point.day, granularity)
    let bucket = totals.get(key)
    if (!bucket) {
      bucket = { downloads: 0, naturalStart, naturalEnd }
      totals.set(key, bucket)
      order.push(key)
    }
    bucket.downloads += point.downloads
  }

  const result: DayPoint[] = []
  // `totals` keeps insertion order, which is exactly what `order` recorded,
  // so iterating the map itself yields every entry without a lookup that
  // cannot fail.
  for (const [key, bucket] of totals) {
    const isLeading = key === order[0]
    const isTrailing = key === order[order.length - 1]
    // A range starting mid-month makes its first bucket a partial month, which
    // reads as a false dip -- the same problem the trailing guard solves.
    if (
      isLeading &&
      dropLeading &&
      bucket.naturalStart < firstDataDay &&
      order.length > 1
    )
      continue
    if (
      isTrailing &&
      dropIncomplete &&
      bucket.naturalEnd > lastDataDay &&
      order.length > 1
    )
      continue
    result.push({ day: key, downloads: bucket.downloads })
  }

  return result
}

/* ---------------------------------------------------------------- pipeline */

export interface PrepareOptions {
  granularity?: Granularity
  /** Drop leading days before the package had any downloads. Default on. */
  trimHead?: boolean
  /** Drop trailing unfinalised days. Default on. */
  trimTail?: boolean
  /** Interpolate interior gaps bounded by real data. Default on. */
  fillGaps?: boolean
  dropIncompleteTrailing?: boolean
  dropIncompleteLeading?: boolean
}

export interface PreparedSeries {
  points: DayPoint[]
  report: HygieneReport
}

/** Full pipeline: hygiene, then aggregation, with a report of what changed. */
export function prepareSeries(
  points: readonly DayPoint[],
  options: PrepareOptions = {}
): PreparedSeries {
  const {
    granularity = 'daily',
    trimHead = true,
    trimTail = true,
    fillGaps = true,
    dropIncompleteTrailing = true,
    dropIncompleteLeading = true,
  } = options

  let working = points.map((p) => ({ ...p }))
  let trimmedHead = 0
  let trimmedTail = 0
  let filledGaps = 0

  if (trimHead) {
    const head = trimMissingHead(working)
    working = head.points
    trimmedHead = head.removed
  }
  if (trimTail) {
    const tail = trimMissingTail(working)
    working = tail.points
    trimmedTail = tail.removed
  }
  if (fillGaps) {
    const gaps = fillInteriorGaps(working)
    working = gaps.points
    filledGaps = gaps.filled
  }

  const aggregated = aggregate(working, granularity, {
    dropIncompleteTrailing,
    dropIncompleteLeading,
  })

  return {
    points: aggregated,
    report: {
      trimmedHead,
      trimmedTail,
      filledGaps,
      firstRealDay: working.length > 0 ? working[0].day : null,
      lastRealDay: working.length > 0 ? working[working.length - 1].day : null,
    },
  }
}
