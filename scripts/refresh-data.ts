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
 * Builds `data/downloads.json`, the snapshot every package page is rendered from.
 *
 * A snapshot rather than a build-time fetch, for two reasons. It keeps `pnpm
 * build` offline and deterministic -- CI builds the site without the network and
 * gets the same HTML every time -- and it means the data that produced a
 * deployed page is reviewable in the repository rather than gone.
 *
 * The series in here are produced by `prepareSeries`, the same pipeline the
 * interactive chart runs, so a static page cannot disagree with the app about
 * what a package's downloads are. Nothing is recomputed differently for the sake
 * of a build step.
 *
 * Run with `pnpm data:refresh`. A cold run is about a dozen requests: the bulk
 * endpoint takes 128 packages for 365 days at a time, so the whole list fits in
 * one batch across twelve chunks.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { prepareSeries } from '../src/lib/aggregate.ts'
import {
  addDays,
  DATA_START,
  type DayPoint,
  fetchDownloads,
  NpmApiError,
  type SeriesMap,
  todayISO,
} from '../src/lib/npm-api.ts'
import { TRACKED_PACKAGES } from '../src/lib/packages.ts'
import type { PackageSeries, Snapshot } from '../src/lib/snapshot.ts'

/**
 * Long enough for the 90-day figures and a year-over-year one, short enough that
 * the snapshot stays reviewable. The full record is kept monthly instead.
 */
const DAILY_WINDOW = 200
const OUT = 'data/downloads.json'

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

/**
 * Fetch, and if a batch 404s, bisect it.
 *
 * The bulk endpoint answers 404 for the whole batch without saying which name it
 * did not recognise, so the only way to find the culprit is to keep halving.
 * Worth the few extra requests: the alternative is a scheduled refresh that
 * starts failing, and a site that quietly stops updating, the first time a
 * package is renamed or unpublished.
 */
async function fetchResilient(
  names: readonly string[],
  end: string
): Promise<{ series: SeriesMap; dropped: string[]; requests: number }> {
  try {
    const result = await fetchDownloads([...names], { start: DATA_START, end })
    return { series: result.series, dropped: [], requests: result.requests }
  } catch (error) {
    const notFound = error instanceof NpmApiError && error.code === 'not-found'
    if (!notFound) throw error
    if (names.length === 1)
      return { series: {}, dropped: [...names], requests: 0 }

    const half = Math.ceil(names.length / 2)
    const left = await fetchResilient(names.slice(0, half), end)
    const right = await fetchResilient(names.slice(half), end)
    return {
      series: { ...left.series, ...right.series },
      dropped: [...left.dropped, ...right.dropped],
      requests: left.requests + right.requests,
    }
  }
}

const end = todayISO()
console.log(
  `fetching ${TRACKED_PACKAGES.length} packages, ${DATA_START} to ${end}…`
)

const { series, dropped, requests } = await fetchResilient(
  TRACKED_PACKAGES,
  end
)
if (dropped.length > 0) {
  console.warn(
    `not found on npm, dropped from the snapshot: ${dropped.join(', ')}`
  )
}

const packages: Record<string, PackageSeries> = {}
const unpublished: string[] = []
for (const name of TRACKED_PACKAGES) {
  const points = series[name]
  if (!points || points.length === 0) {
    unpublished.push(name)
    continue
  }
  const summary = summarise(points)
  if (summary) packages[name] = summary
  else unpublished.push(name)
}

const names = Object.keys(packages)
if (names.length === 0) throw new Error('no package had enough data to publish')

const snapshot: Snapshot = {
  generatedAt: end,
  lastDay: names
    .map((name) => packages[name].lastDay)
    .sort()
    .at(-1) as string,
  packages,
}

const json = `${JSON.stringify(snapshot)}\n`
mkdirSync('data', { recursive: true })
writeFileSync(OUT, json)

console.log(
  `wrote ${OUT}: ${names.length} packages, ${(json.length / 1024).toFixed(0)} KB, ${requests} requests`
)
if (unpublished.length > 0) {
  console.warn(`too little data to publish: ${unpublished.join(', ')}`)
}
