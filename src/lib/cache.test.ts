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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { must } from '../testing/must.ts'
import { cacheKey, readCachedSeries, writeCachedSeries } from './cache.ts'
import { addDays, type DayPoint } from './npm-api.ts'

const KEY = 'v1|react|2026-01-01|2026-01-10'

const days = (start: string, values: number[]): DayPoint[] =>
  values.map((downloads, i) => ({ day: addDays(start, i), downloads }))

beforeEach(() => {
  window.localStorage.clear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('cacheKey', () => {
  it('namespaces entries with the cache version, so a shape change invalidates them', () => {
    expect(cacheKey(['react'], '2026-01-01', '2026-01-10')).toBe(
      'v1|react|2026-01-01|2026-01-10'
    )
  })

  it('sorts the package list, so ordering does not fragment the cache', () => {
    expect(cacheKey(['vue', 'react'], 'a', 'b')).toBe(
      cacheKey(['react', 'vue'], 'a', 'b')
    )
  })

  it('separates different windows', () => {
    expect(cacheKey(['react'], '2026-01-01', '2026-01-10')).not.toBe(
      cacheKey(['react'], '2026-01-01', '2026-01-11')
    )
  })
})

describe('round trip', () => {
  it('stores and restores a series', () => {
    const points = days('2026-01-01', [1, 2, 3])
    writeCachedSeries(KEY, points)
    expect(readCachedSeries(KEY)).toEqual(points)
  })

  it('rebuilds every day from the stored start date', () => {
    // The compact form keeps only values, so a day is start + index. Getting
    // that arithmetic wrong would shift the whole series.
    writeCachedSeries(KEY, days('2026-01-01', [1, 2, 3]))
    expect(readCachedSeries(KEY)?.map((p) => p.day)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ])
  })

  it('stores days as bare values rather than objects', () => {
    writeCachedSeries(KEY, days('2026-01-01', [1, 2, 3]))
    const raw = must(window.localStorage.getItem(KEY), 'the cached entry')
    // {savedAt, start, values:[1,2,3]} -- a quarter the size of the object form.
    expect(JSON.parse(raw)).toMatchObject({
      start: '2026-01-01',
      values: [1, 2, 3],
    })
  })

  it('returns null for an entry that was never written', () => {
    expect(readCachedSeries('v1|nothing|a|b')).toBeNull()
  })

  it('does nothing when asked to cache an empty series', () => {
    writeCachedSeries(KEY, [])
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })
})

describe('expiry', () => {
  it('serves an entry inside the six-hour window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'))
    writeCachedSeries(KEY, days('2026-01-01', [1]))

    vi.setSystemTime(new Date('2026-10-12T15:59:00Z'))
    expect(readCachedSeries(KEY)).not.toBeNull()
  })

  it('drops and deletes an entry past it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'))
    writeCachedSeries(KEY, days('2026-01-01', [1]))

    vi.setSystemTime(new Date('2026-10-12T17:00:00Z'))
    expect(readCachedSeries(KEY)).toBeNull()
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })
})

describe('what is refused', () => {
  it('refuses a non-contiguous series, which the compact form cannot represent', () => {
    // Rebuilding days from a start date assumes one day per element, so a gap
    // would silently shift every later day.
    const gapped: DayPoint[] = [
      { day: '2026-01-01', downloads: 1 },
      { day: '2026-01-05', downloads: 2 },
    ]
    writeCachedSeries(KEY, gapped)
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('refuses an entry larger than the per-entry budget', () => {
    // Each value is six digits, so 250k of them clears the 1.5MB ceiling.
    const huge = days(
      '2015-01-01',
      Array.from({ length: 250_000 }, () => 123456)
    )
    writeCachedSeries(KEY, huge)
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('discards an unparseable entry rather than throwing, and clears it', () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(readCachedSeries(KEY)).toBeNull()
    // Removed, not merely ignored: it can never become useful again and would
    // otherwise occupy the quota and be re-parsed on every load.
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('discards an entry whose shape is wrong', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: 'soon', values: 'nope' })
    )
    expect(readCachedSeries(KEY)).toBeNull()
  })

  it('discards an entry with no timestamp', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ values: [1, 2] }))
    expect(readCachedSeries(KEY)).toBeNull()
  })
})

describe('when storage is unavailable', () => {
  it('reads as a miss instead of throwing', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(readCachedSeries(KEY)).toBeNull()
  })

  it('writes nowhere instead of throwing', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => writeCachedSeries(KEY, days('2026-01-01', [1]))).not.toThrow()
  })
})

describe('when the quota is exceeded', () => {
  it('swallows the failure and sweeps expired entries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'))
    writeCachedSeries('v1|old|a|b', days('2026-01-01', [1]))

    // Age that entry past the TTL, then make every cache write fail.
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'))
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith('v1|'))
        throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, key, value)
    })

    expect(() => writeCachedSeries(KEY, days('2026-01-01', [1]))).not.toThrow()
    expect(window.localStorage.getItem('v1|old|a|b')).toBeNull()
  })
})
