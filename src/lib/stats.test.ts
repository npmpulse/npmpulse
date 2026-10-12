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
import { seriesFixture as make } from '../testing/fixtures.ts'
import {
  alignedMonthly,
  compareSeries,
  monthlyPoints,
  recentPoints,
  statsFor,
} from './stats.ts'

describe('statsFor', () => {
  it('sums the trailing windows over the daily figures', () => {
    const stats = statsFor(make())
    expect(stats.last7).toBe(70)
    expect(stats.last30).toBe(300)
    expect(stats.last90).toBe(900)
  })

  it('leaves a window out rather than calling it zero', () => {
    // A package with three weeks of daily history has no 90-day figure, and a
    // zero there would read as "nothing downloaded" instead of "not yet known".
    const stats = statsFor(
      make({ daily: Array.from({ length: 21 }, () => 10) })
    )
    expect(stats.last7).toBe(70)
    expect(stats.last90).toBeNull()
  })

  it('names the best month, and the first month', () => {
    const monthly = [10, 5000, 900, 700]
    const stats = statsFor(make({ monthly, monthlyStart: '2025-12-01' }))
    expect(stats.bestMonth).toEqual({ label: 'Jan 2026', downloads: 5000 })
    expect(stats.firstMonth).toBe('Dec 2025')
    expect(stats.months).toBe(4)
  })

  it('compares the trailing year with the year before it', () => {
    // 24 months: 1000 each, except the last twelve at 2000.
    const monthly = [
      ...Array.from({ length: 12 }, () => 1000),
      ...Array.from({ length: 12 }, () => 2000),
    ]
    expect(statsFor(make({ monthly })).yearOverYear).toBe(2)
  })

  it('has no year-over-year figure under two full years', () => {
    const monthly = Array.from({ length: 18 }, () => 1000)
    expect(statsFor(make({ monthly })).yearOverYear).toBeNull()
  })

  it('refuses to divide by an empty year', () => {
    const monthly = [
      ...Array.from({ length: 12 }, () => 0),
      ...Array.from({ length: 12 }, () => 500),
    ]
    expect(statsFor(make({ monthly })).yearOverYear).toBeNull()
  })
})

describe('chart points', () => {
  it('dates each monthly point from the month it starts', () => {
    const points = monthlyPoints(
      make({ monthly: [1, 2, 3], monthlyStart: '2025-11-01' })
    )
    expect(points).toEqual([
      { day: '2025-11-01', value: 1 },
      { day: '2025-12-01', value: 2 },
      { day: '2026-01-01', value: 3 },
    ])
  })

  it('dates each daily point from the day it starts, across a year boundary', () => {
    const points = recentPoints(
      make({ daily: [1, 2], dailyStart: '2025-12-31' })
    )
    expect(points).toEqual([
      { day: '2025-12-31', value: 1 },
      { day: '2026-01-01', value: 2 },
    ])
  })
})

describe('alignedMonthly', () => {
  it('puts two records on one axis, with zeros before either begins', () => {
    const a = make({ monthly: [1, 2, 3], monthlyStart: '2026-01-01' })
    const b = make({ monthly: [9, 9], monthlyStart: '2026-02-01' })
    const aligned = alignedMonthly(a, b)
    expect(aligned.months).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(aligned.a).toEqual([1, 2, 3])
    expect(aligned.b).toEqual([0, 9, 9])
  })

  it('lines up series that start in the same month', () => {
    const a = make({ monthly: [1, 2], monthlyStart: '2026-01-01' })
    const b = make({ monthly: [3, 4], monthlyStart: '2026-01-01' })
    expect(alignedMonthly(a, b)).toEqual({
      months: ['2026-01-01', '2026-02-01'],
      a: [1, 2],
      b: [3, 4],
    })
  })
})

describe('compareSeries', () => {
  const steady = (last90: number, last12: number, prior12: number) =>
    make({
      daily: Array.from({ length: 200 }, () => last90 / 90),
      monthly: [
        ...Array.from({ length: 12 }, () => prior12 / 12),
        ...Array.from({ length: 12 }, () => last12 / 12),
      ],
    })

  it('expresses one side as a share of the other', () => {
    const comparison = compareSeries(
      steady(900, 1200, 1200),
      steady(300, 1200, 1200)
    )
    expect(comparison.share).toBeCloseTo(1 / 3)
  })

  it('says who leads on the trailing year', () => {
    expect(
      compareSeries(steady(900, 100, 100), steady(900, 200, 200)).leader
    ).toBe('b')
    expect(
      compareSeries(steady(900, 200, 200), steady(900, 100, 100)).leader
    ).toBe('a')
  })

  it('reports the month the lead last changed hands', () => {
    const a = make({
      monthly: [100, 100, 100, 100],
      monthlyStart: '2026-01-01',
    })
    const b = make({ monthly: [1, 1, 200, 200], monthlyStart: '2026-01-01' })
    expect(compareSeries(a, b).crossing).toEqual({
      month: '2026-03-01',
      took: 'b',
    })
  })

  it('ignores a lead that lasted a single month', () => {
    // The react/vue case: one spiked month, then straight back. npm's figures do
    // this, and calling it a crossing put a false claim on 70 pages.
    const a = make({
      monthly: [100, 100, 100, 100],
      monthlyStart: '2026-01-01',
    })
    const b = make({ monthly: [1, 300, 1, 1], monthlyStart: '2026-01-01' })
    expect(compareSeries(a, b).crossing).toBeNull()
  })

  it('has no crossing when one side led throughout', () => {
    const a = make({ monthly: [100, 100, 100], monthlyStart: '2026-01-01' })
    const b = make({ monthly: [1, 1, 1], monthlyStart: '2026-01-01' })
    expect(compareSeries(a, b).crossing).toBeNull()
  })

  it('asks for a log axis only when linear would flatten a line', () => {
    expect(
      compareSeries(steady(900, 1000, 1000), steady(900, 900, 900)).log
    ).toBe(false)
    expect(
      compareSeries(steady(900, 100000, 100000), steady(900, 100, 100)).log
    ).toBe(true)
  })

  it('has no share when a side has too little daily history', () => {
    const short = make({ daily: Array.from({ length: 10 }, () => 1) })
    expect(compareSeries(short, make()).share).toBeNull()
  })
})
