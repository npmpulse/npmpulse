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
  fastestGrowing,
  recordStarts,
  thenAndNow,
  windowLabel,
  windowSum,
} from './rankings.ts'

/** A record of `values` starting at `start`, one value per month. */
const from = (start: string, values: number[]) =>
  make({ monthlyStart: start, monthly: values })

describe('windowSum', () => {
  it('sums the months a window covers', () => {
    const series = from('2015-03-01', [1, 2, 3, 4])
    expect(windowSum(series, '2015-04-01', 2)).toBe(5)
  })

  it('returns null for a window the record does not cover', () => {
    const series = from('2015-03-01', [1, 2, 3, 4])
    expect(windowSum(series, '2015-01-01', 2)).toBeNull() // starts before the record
    expect(windowSum(series, '2015-06-01', 2)).toBeNull() // runs past the end
  })
})

describe('thenAndNow', () => {
  it('compares the ten months of 2015 with the same ten of 2025', () => {
    // 12 months from 2015-03, then a gap, then the 2025 window.
    const months = [
      ...Array.from({ length: 12 }, () => 100), // 2015-03 .. 2016-02
      ...Array.from({ length: 108 }, () => 0), // through 2025-02
      ...Array.from({ length: 10 }, () => 500), // 2025-03 .. 2025-12
    ]
    const rows = thenAndNow({ steady: from('2015-03-01', months) })
    expect(rows).toEqual([
      { name: 'steady', before: 1000, after: 5000, multiple: 5 },
    ])
  })

  it('leaves out a package that did not exist then', () => {
    const rows = thenAndNow({
      young: from(
        '2020-01-01',
        Array.from({ length: 72 }, () => 10)
      ),
    })
    expect(rows).toEqual([])
  })

  it('puts the fastest multiple first', () => {
    const flat = Array.from({ length: 130 }, (_, i) => (i >= 120 ? 10 : 5))
    const steep = Array.from({ length: 130 }, (_, i) => (i >= 120 ? 100 : 5))
    const rows = thenAndNow({
      flat: from('2015-03-01', flat),
      steep: from('2015-03-01', steep),
    })
    expect(rows.map((r) => r.name)).toEqual(['steep', 'flat'])
  })
})

describe('recordStarts', () => {
  it('orders by the first day, then by how big that day was', () => {
    const rows = recordStarts({
      b: make({ firstDay: '2015-02-27', firstDayDownloads: 300 }),
      a: make({ firstDay: '2015-02-27', firstDayDownloads: 900 }),
      later: make({ firstDay: '2020-04-21', firstDayDownloads: 12 }),
    })
    expect(rows.map((r) => r.name)).toEqual(['a', 'b', 'later'])
  })
})

describe('fastestGrowing', () => {
  it('compares the trailing year with the one before it', () => {
    const monthly = [
      ...Array.from({ length: 12 }, () => 1_000_000),
      ...Array.from({ length: 12 }, () => 3_000_000),
    ]
    const rows = fastestGrowing(
      { tripled: make({ monthlyStart: '2024-11-01', monthly }) },
      1_000_000
    )
    expect(rows).toEqual([
      {
        name: 'tripled',
        multiple: 3,
        before: 12_000_000,
        after: 36_000_000,
      },
    ])
  })

  it('applies the floor, so tiny packages cannot top the list', () => {
    const small = [
      ...Array.from({ length: 12 }, () => 10),
      ...Array.from({ length: 12 }, () => 10_000),
    ]
    expect(
      fastestGrowing(
        { small: make({ monthlyStart: '2024-11-01', monthly: small }) },
        1_000_000
      )
    ).toEqual([])
  })

  it('needs two full years to say anything', () => {
    expect(
      fastestGrowing({
        young: make({ monthly: Array.from({ length: 18 }, () => 5e6) }),
      })
    ).toEqual([])
  })
})

describe('windowLabel', () => {
  it('names both ends of a window', () => {
    expect(windowLabel('2015-03-01', 10)).toBe('Mar 2015 – Dec 2015')
  })
})
