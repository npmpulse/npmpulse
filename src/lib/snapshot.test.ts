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

import { describe, expect, it } from 'vitest'
import { addDays } from './npm-api.ts'
import {
  dayAt,
  monthStart,
  SNAPSHOT_PACKAGES,
  seriesFor,
  snapshot,
} from './snapshot.ts'

/**
 * These check the committed snapshot rather than the code that reads it: a
 * truncated array or a drifted start date would otherwise reach a page silently,
 * because every page trusts `start + index` to be a real date.
 */
describe('the snapshot', () => {
  it('lists every package it stores', () => {
    expect(SNAPSHOT_PACKAGES).toEqual(Object.keys(snapshot.packages).sort())
    expect(SNAPSHOT_PACKAGES.length).toBeGreaterThan(50)
  })

  it('dates every package consistently', () => {
    for (const name of SNAPSHOT_PACKAGES) {
      const series = snapshot.packages[name]
      expect(series.firstDay <= series.lastDay, name).toBe(true)
      expect(series.total, name).toBeGreaterThan(0)
      expect(series.monthly.length, name).toBeGreaterThanOrEqual(2)
      expect(series.daily.length, name).toBeLessThanOrEqual(200)
      // The first complete month is the month after the first day's, unless that
      // day is the first of a month.
      // The first complete month is the one after the month the record starts
      // in, unless that record starts on the first of a month.
      const firstMonth = `${series.firstDay.slice(0, 7)}-01`
      expect(series.monthlyStart >= firstMonth, name).toBe(true)
    }
  })

  it('stores both series as bare values that a start date can index', () => {
    for (const name of SNAPSHOT_PACKAGES) {
      const series = snapshot.packages[name]
      const firstDaily = new Date(`${series.dailyStart}T00:00:00Z`).getTime()
      const lastDaily = new Date(`${series.lastDay}T00:00:00Z`).getTime()
      const span = Math.round((lastDaily - firstDaily) / 86_400_000) + 1
      expect(series.daily.length, name).toBe(span)
      expect(series.monthly.at(-1), name).toBeGreaterThan(-1)
    }
  })
})

describe('monthStart', () => {
  it('walks forward across year boundaries', () => {
    expect(monthStart('2025-11-01', 0)).toBe('2025-11-01')
    expect(monthStart('2025-11-01', 2)).toBe('2026-01-01')
    expect(monthStart('2025-01-01', 13)).toBe('2026-02-01')
  })
})

describe('dayAt', () => {
  it('walks forward across year boundaries', () => {
    expect(dayAt('2025-12-31', 0)).toBe('2025-12-31')
    expect(dayAt('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('seriesFor', () => {
  it('returns the stored series for a tracked package', () => {
    const name = SNAPSHOT_PACKAGES[0]
    expect(seriesFor(name)).toBe(snapshot.packages[name])
  })

  it('returns nothing for a name the snapshot does not hold', () => {
    expect(seriesFor('not-a-tracked-package')).toBeUndefined()
  })
})
