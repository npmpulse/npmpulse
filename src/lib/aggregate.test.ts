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
import {
  aggregate,
  fillInteriorGaps,
  GRANULARITIES,
  prepareSeries,
  trimMissingHead,
  trimMissingTail,
  weekStart,
} from './aggregate.ts'
import type { DayPoint } from './npm-api.ts'

const pt = (day: string, downloads: number): DayPoint => ({ day, downloads })

/** Consecutive days starting at `start`, with the given values. */
const days = (start: string, values: number[]): DayPoint[] => {
  const out: DayPoint[] = []
  let cursor = Date.parse(`${start}T00:00:00Z`)
  for (const value of values) {
    out.push({
      day: new Date(cursor).toISOString().slice(0, 10),
      downloads: value,
    })
    cursor += 86_400_000
  }
  return out
}

describe('trimMissingHead', () => {
  it('drops the run of zeros before a package existed', () => {
    // The API reports 0 rather than omitting the day, so an untrimmed series
    // opens with a flat run that never happened.
    const result = trimMissingHead([
      pt('2015-01-10', 0),
      pt('2015-01-11', 0),
      pt('2015-02-27', 5),
    ])
    expect(result.removed).toBe(2)
    expect(result.points).toEqual([pt('2015-02-27', 5)])
  })

  it('leaves an interior zero alone', () => {
    const result = trimMissingHead([pt('d1', 5), pt('d2', 0), pt('d3', 7)])
    expect(result.removed).toBe(0)
    expect(result.points).toHaveLength(3)
  })

  it('empties an all-zero series', () => {
    const result = trimMissingHead([pt('d1', 0), pt('d2', 0)])
    expect(result.points).toEqual([])
    expect(result.removed).toBe(2)
  })

  it('handles an empty input', () => {
    expect(trimMissingHead([])).toEqual({ points: [], removed: 0 })
  })
})

describe('trimMissingTail', () => {
  it('drops the days npm has not finalised', () => {
    const result = trimMissingTail([
      pt('d1', 5),
      pt('d2', 7),
      pt('d3', 0),
      pt('d4', 0),
    ])
    expect(result.removed).toBe(2)
    expect(result.points).toHaveLength(2)
  })

  it('leaves an interior zero alone', () => {
    expect(
      trimMissingTail([pt('d1', 5), pt('d2', 0), pt('d3', 7)]).removed
    ).toBe(0)
  })

  it('empties an all-zero series', () => {
    expect(trimMissingTail([pt('d1', 0), pt('d2', 0)]).points).toEqual([])
  })
})

describe('fillInteriorGaps', () => {
  it('interpolates a single missing day between real readings', () => {
    const result = fillInteriorGaps([pt('d1', 100), pt('d2', 0), pt('d3', 300)])
    expect(result.filled).toBe(1)
    expect(result.points[1].downloads).toBe(200)
  })

  it('spreads a multi-day gap monotonically across its span', () => {
    const result = fillInteriorGaps([
      pt('d1', 100),
      pt('d2', 0),
      pt('d3', 0),
      pt('d4', 400),
    ])
    expect(result.filled).toBe(2)
    const [, second, third] = result.points
    expect(second.downloads).toBeGreaterThan(100)
    expect(third.downloads).toBeGreaterThan(second.downloads)
    expect(third.downloads).toBeLessThan(400)
  })

  it('never invents data at the head, where nothing precedes it', () => {
    expect(
      fillInteriorGaps([pt('d1', 0), pt('d2', 0), pt('d3', 300)]).filled
    ).toBe(0)
  })

  it('never invents data at the tail', () => {
    expect(
      fillInteriorGaps([pt('d1', 100), pt('d2', 200), pt('d3', 0), pt('d4', 0)])
        .filled
    ).toBe(0)
  })

  it('fills only the bounded run when a tail gap follows an interior one', () => {
    const result = fillInteriorGaps([
      pt('d1', 100),
      pt('d2', 0),
      pt('d3', 300),
      pt('d4', 0),
      pt('d5', 0),
    ])
    expect(result.filled).toBe(1)
    expect(result.points[3].downloads).toBe(0)
  })

  it('leaves a zero next to a zero neighbour unfilled when unbounded', () => {
    const result = fillInteriorGaps([pt('d1', 100), pt('d2', 0), pt('d3', 0)])
    expect(result.filled).toBe(0)
  })

  it('returns short series untouched', () => {
    expect(fillInteriorGaps([pt('d1', 0)]).filled).toBe(0)
    expect(fillInteriorGaps([pt('d1', 0), pt('d2', 0)]).filled).toBe(0)
  })

  it('does not mutate its input', () => {
    const input = [pt('d1', 100), pt('d2', 0), pt('d3', 300)]
    fillInteriorGaps(input)
    expect(input[1].downloads).toBe(0)
  })
})

describe('weekStart', () => {
  it('returns the Monday of the containing ISO week', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29') // Thursday -> previous Monday
    expect(weekStart('2025-12-29')).toBe('2025-12-29') // Monday -> itself
    expect(weekStart('2026-01-04')).toBe('2025-12-29') // Sunday -> the Monday before
  })
})

describe('GRANULARITIES', () => {
  it('lists the four supported granularities', () => {
    expect(GRANULARITIES).toEqual(['daily', 'weekly', 'monthly', 'yearly'])
  })
})

describe('aggregate', () => {
  it('returns daily input unchanged, as copies', () => {
    const input = [pt('2026-01-01', 1), pt('2026-01-02', 2)]
    const result = aggregate(input, 'daily')
    expect(result).toEqual(input)
    expect(result[0]).not.toBe(input[0])
  })

  it('sums a week across a year boundary into one bucket', () => {
    const week = days('2025-12-29', [1, 1, 1, 1, 1, 1, 1])
    const result = aggregate(week, 'weekly')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(pt('2025-12-29', 7))
  })

  it('sums calendar months', () => {
    const result = aggregate(
      [pt('2026-01-31', 10), pt('2026-02-01', 20), pt('2026-02-28', 5)],
      'monthly',
      {
        dropIncompleteTrailing: false,
        dropIncompleteLeading: false,
      }
    )
    expect(result).toEqual([pt('2026-01-01', 10), pt('2026-02-01', 25)])
  })

  it('sums calendar years', () => {
    const result = aggregate(
      [pt('2025-12-31', 4), pt('2026-01-01', 6)],
      'yearly',
      {
        dropIncompleteTrailing: false,
        dropIncompleteLeading: false,
      }
    )
    expect(result).toEqual([pt('2025-01-01', 4), pt('2026-01-01', 6)])
  })

  it('returns nothing for empty input', () => {
    expect(aggregate([], 'monthly')).toEqual([])
  })

  it('drops a trailing period the data does not fully cover', () => {
    // Three days into a week: a partial week reads as a collapse, not as a
    // partial. Full first week, plus a stub second one.
    const points = days('2025-12-29', [10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
    const result = aggregate(points, 'weekly')
    expect(result).toEqual([pt('2025-12-29', 70)])
  })

  it('drops a leading period that starts before the data does', () => {
    const result = aggregate(
      [pt('2026-01-31', 10), pt('2026-02-01', 20), pt('2026-02-28', 5)],
      'monthly',
      {
        dropIncompleteTrailing: false,
      }
    )
    expect(result).toEqual([pt('2026-02-01', 25)])
  })

  it('keeps a leading period that begins exactly on the data start', () => {
    const result = aggregate(
      [pt('2026-02-01', 10), pt('2026-02-02', 10), pt('2026-03-01', 5)],
      'monthly',
      {
        dropIncompleteTrailing: false,
      }
    )
    expect(result[0]).toEqual(pt('2026-02-01', 20))
  })

  it('never empties the series by dropping its only period', () => {
    const result = aggregate(
      [pt('2026-01-01', 1), pt('2026-01-02', 1)],
      'yearly'
    )
    expect(result).toEqual([pt('2026-01-01', 2)])
  })

  it('can be told to keep incomplete periods', () => {
    const points = days('2025-12-29', [10, 10, 10, 10, 10, 10, 10, 10, 10])
    expect(
      aggregate(points, 'weekly', { dropIncompleteTrailing: false })
    ).toHaveLength(2)
  })

  it('leaves daily granularity unaffected by the incompleteness rules', () => {
    expect(
      aggregate([pt('2026-01-01', 1), pt('2026-01-02', 1)], 'daily')
    ).toHaveLength(2)
  })
})

describe('prepareSeries', () => {
  it('runs hygiene then aggregation and reports what it changed', () => {
    const raw = days('2015-01-10', [
      ...Array(48).fill(0),
      ...Array(30).fill(10),
      0,
      0,
    ])
    const { points, report } = prepareSeries(raw, { granularity: 'daily' })

    expect(report.trimmedHead).toBe(48)
    expect(report.trimmedTail).toBe(2)
    expect(report.firstRealDay).toBe('2015-02-27')
    expect(points.every((p) => p.downloads > 0)).toBe(true)
  })

  it('leaves nothing to chart when every reading is zero', () => {
    const { points, report } = prepareSeries(days('2026-01-01', [0, 0, 0]), {})
    expect(points).toEqual([])
    expect(report.firstRealDay).toBeNull()
    expect(report.lastRealDay).toBeNull()
  })

  it('reports how many interior days it interpolated', () => {
    const raw = [
      ...days('2026-01-01', [10, 10, 10]),
      pt('2026-01-04', 0),
      pt('2026-01-05', 30),
    ]
    const { report } = prepareSeries(raw, { granularity: 'daily' })
    expect(report.filledGaps).toBe(1)
  })

  it('can skip each hygiene step independently', () => {
    const raw = days('2015-01-10', [
      ...Array(5).fill(0),
      ...Array(5).fill(10),
      0,
    ])
    expect(prepareSeries(raw, { trimHead: false }).report.trimmedHead).toBe(0)
    expect(prepareSeries(raw, { trimTail: false }).report.trimmedTail).toBe(0)
    expect(prepareSeries(raw, { fillGaps: false }).report.filledGaps).toBe(0)
  })

  it('forwards the incomplete-period switches to aggregate', () => {
    const raw = days('2025-12-29', Array(10).fill(10))
    expect(prepareSeries(raw, { granularity: 'weekly' }).points).toHaveLength(1)
    expect(
      prepareSeries(raw, {
        granularity: 'weekly',
        dropIncompleteTrailing: false,
      }).points
    ).toHaveLength(2)
  })

  it('does not mutate its input', () => {
    const raw = days('2015-01-10', [
      ...Array(5).fill(0),
      ...Array(5).fill(10),
      0,
    ])
    const snapshot = JSON.parse(JSON.stringify(raw))
    prepareSeries(raw, { granularity: 'daily' })
    expect(raw).toEqual(snapshot)
  })
})
