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
 * The generated snapshot of download history, and the accessors the static pages
 * read it through.
 *
 * `data/downloads.json` is written by `pnpm data:refresh` and committed, so the
 * build reads it from disk rather than the network: `pnpm build` is offline and
 * deterministic, and the figures behind a deployed page are in the repository
 * instead of gone. Types live here rather than in the script so that the script
 * depends on `src/`, not the other way round.
 */

import raw from '../../data/downloads.json'

export interface PackageSeries {
  /** First day npm reports a non-zero count for the name. */
  firstDay: string
  /**
   * What that day was worth. Shown next to the date because a package's record
   * can begin long before the package did -- npm names get reused, so what looks
   * like a slow start is sometimes an earlier holder of the name. A first day of
   * one or two downloads says that plainly; a first day of 300,000 says the
   * opposite.
   */
  firstDayDownloads: number
  /** Last day npm had finalised when the snapshot was taken. */
  lastDay: string
  total: number
  /** Complete calendar months, oldest first, contiguous from `monthlyStart`. */
  monthlyStart: string
  monthly: number[]
  /** Recent days, oldest first, contiguous from `dailyStart`. */
  dailyStart: string
  daily: number[]
}

export interface Snapshot {
  generatedAt: string
  lastDay: string
  packages: Record<string, PackageSeries>
}

/**
 * The snapshot's figures end here. Pages date themselves from this rather than
 * from the clock, so a page rendered today and the same page rendered tomorrow
 * from the same snapshot say the same things.
 */
export const snapshot = raw as Snapshot

export const snapshotLastDay = snapshot.lastDay

/** The series for a package, or undefined when the snapshot has none. */
export function seriesFor(name: string): PackageSeries | undefined {
  return snapshot.packages[name]
}

/** Every package with a series, in a stable order. */
export const SNAPSHOT_PACKAGES: readonly string[] = Object.keys(
  snapshot.packages
).sort()

/** 'YYYY-MM-01' for `index` months after `start`, which is itself a month start. */
export function monthStart(start: string, index: number): string {
  const [year, month] = start.split('-').map(Number)
  const zero = year * 12 + (month - 1) + index
  const y = Math.floor(zero / 12)
  const m = (zero % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** 'YYYY-MM-DD' for `index` days after `start`. */
export function dayAt(start: string, index: number): string {
  const [y, m, d] = start.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d) + index * 86_400_000)
  return date.toISOString().slice(0, 10)
}
