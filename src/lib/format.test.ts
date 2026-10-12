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
  formatCompact,
  formatFull,
  formatPeriod,
  formatShare,
  formatTick,
} from './format.ts'

describe('formatCompact', () => {
  it('rounds to a whole number below 1000', () => {
    expect(formatCompact(0)).toBe('0')
    expect(formatCompact(7)).toBe('7')
    expect(formatCompact(999.4)).toBe('999')
    expect(formatCompact(999.6)).toBe('1000')
  })

  it('uses one decimal below 10 units and none above, so ticks stay short', () => {
    expect(formatCompact(1200)).toBe('1.2K')
    expect(formatCompact(12_000)).toBe('12K')
    expect(formatCompact(1_500_000)).toBe('1.5M')
    expect(formatCompact(842_401_028)).toBe('842M')
    expect(formatCompact(2_100_000_000)).toBe('2.1B')
  })

  it('drops a trailing .0 rather than printing "2.0M"', () => {
    expect(formatCompact(2_000_000)).toBe('2M')
    expect(formatCompact(3_000_000_000)).toBe('3B')
  })

  it('handles negatives by magnitude', () => {
    expect(formatCompact(-1500)).toBe('-1.5K')
    expect(formatCompact(-5)).toBe('-5')
  })

  it('reaches the trillion unit', () => {
    expect(formatCompact(1_200_000_000_000)).toBe('1.2T')
  })
})

describe('formatFull', () => {
  it('groups thousands', () => {
    expect(formatFull(1234567)).toBe('1,234,567')
    expect(formatFull(999)).toBe('999')
  })
})

describe('formatPeriod', () => {
  it('formats each granularity', () => {
    expect(formatPeriod('2026-03-04', 'yearly')).toBe('2026')
    expect(formatPeriod('2026-03-04', 'monthly')).toBe('Mar 2026')
    expect(formatPeriod('2026-03-04', 'weekly')).toBe('Week of 2026-03-04')
    expect(formatPeriod('2026-03-04', 'daily')).toBe('2026-03-04')
  })

  it('falls back to the raw day for an unknown granularity', () => {
    expect(formatPeriod('2026-03-04', 'fortnightly')).toBe('2026-03-04')
  })
})

describe('formatTick', () => {
  it('shows only the year for yearly', () => {
    expect(formatTick('2026-03-04', 'yearly', true)).toBe('2026')
  })

  it('always carries a short year for monthly', () => {
    expect(formatTick('2026-03-04', 'monthly')).toBe("Mar '26")
  })

  it('omits the year for daily and weekly unless asked', () => {
    expect(formatTick('2026-03-04', 'daily')).toBe('Mar 4')
    expect(formatTick('2026-03-04', 'daily', true)).toBe("Mar 4 '26")
    expect(formatTick('2026-03-04', 'weekly')).toBe('Mar 4')
    expect(formatTick('2026-03-04', 'weekly', true)).toBe("Mar 4 '26")
  })

  it('strips the leading zero from the day of month', () => {
    expect(formatTick('2026-03-04', 'daily')).toBe('Mar 4')
    expect(formatTick('2026-12-09', 'daily')).toBe('Dec 9')
  })

  it('falls back to the daily form for an unknown granularity', () => {
    expect(formatTick('2026-03-04', 'nonsense')).toBe('Mar 4')
  })
})

describe('formatShare', () => {
  it('gives whole percent from ten up', () => {
    expect(formatShare(0.34)).toBe('34%')
    expect(formatShare(2.14)).toBe('214%')
    expect(formatShare(1)).toBe('100%')
  })

  it('keeps a decimal below ten', () => {
    expect(formatShare(0.034)).toBe('3.4%')
    expect(formatShare(0.099)).toBe('9.9%')
  })

  it('gives a fraction rather than rounding a small share to nothing', () => {
    // The case that made this exist: 0.4% rendered as "0%".
    expect(formatShare(0.0041)).toBe('1/244')
    expect(formatShare(0.001)).toBe('1/1000')
  })

  it('stops inventing denominators past a thousand', () => {
    expect(formatShare(0.00001)).toBe('under 0.1%')
    expect(formatShare(0)).toBe('0%')
  })
})
