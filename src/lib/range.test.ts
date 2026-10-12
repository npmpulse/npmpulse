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
import { addDays, DATA_START } from './npm-api.ts'
import {
  defaultGranularity,
  detectPreset,
  GRANULARITIES,
  PRESETS,
  type PresetKey,
  parseGranularity,
  parseRange,
  presetToRange,
  resolveGranularity,
} from './range.ts'

const TODAY = '2026-10-12'

describe('PRESETS', () => {
  it('offers the six quick ranges in ascending order of length', () => {
    expect(PRESETS.map((p) => p.key)).toEqual([
      '1m',
      '3m',
      '6m',
      '1y',
      '5y',
      'all',
    ])
  })

  it('uses null days to mean "everything", not zero', () => {
    expect(PRESETS.find((p) => p.key === 'all')?.days).toBeNull()
  })
})

describe('presetToRange', () => {
  it('ends every range at today', () => {
    for (const preset of PRESETS) {
      expect(presetToRange(preset.key, TODAY).end).toBe(TODAY)
    }
  })

  it('counts back the preset number of days', () => {
    expect(presetToRange('1m', TODAY).start).toBe('2026-09-12')
    expect(presetToRange('1y', TODAY).start).toBe('2025-10-12')
  })

  it('gives "all" the first day npm has records for', () => {
    expect(presetToRange('all', TODAY)).toEqual({
      start: DATA_START,
      end: TODAY,
    })
  })

  it('clamps to DATA_START when the window would reach past the start of the data', () => {
    // A 5-year lookback from soon after npm began cannot go earlier than 2015.
    const range = presetToRange('5y', '2016-01-01')
    expect(range.start).toBe(DATA_START)
    expect(range.end).toBe('2016-01-01')
  })

  it('clamps every preset when today is itself before the data start', () => {
    for (const preset of PRESETS) {
      expect(presetToRange(preset.key, '2010-01-01').start).toBe(DATA_START)
    }
  })

  it('falls back to the 1Y preset for an unknown key', () => {
    const range = presetToRange('bogus' as Exclude<PresetKey, 'custom'>, TODAY)
    expect(range).toEqual(presetToRange('1y', TODAY))
  })
})

describe('detectPreset', () => {
  it('recognises a range that ends today and matches a preset', () => {
    for (const preset of PRESETS) {
      const range = presetToRange(preset.key, TODAY)
      expect(detectPreset(range, TODAY)).toBe(preset.key)
    }
  })

  it('returns custom when the range does not end today', () => {
    expect(
      detectPreset({ start: '2026-01-01', end: '2026-06-01' }, TODAY)
    ).toBe('custom')
  })

  it('returns custom when it ends today but is not a preset length', () => {
    expect(detectPreset({ start: '2026-10-05', end: TODAY }, TODAY)).toBe(
      'custom'
    )
  })

  it('round-trips through presetToRange for every preset', () => {
    for (const preset of PRESETS) {
      const { start, end } = presetToRange(preset.key, TODAY)
      expect(
        presetToRange(
          detectPreset({ start, end }, TODAY) as Exclude<PresetKey, 'custom'>,
          TODAY
        )
      ).toEqual({
        start,
        end,
      })
    }
  })

  it('does not mistake a long custom range for "all"', () => {
    expect(
      detectPreset({ start: addDays(DATA_START, 1), end: TODAY }, TODAY)
    ).toBe('custom')
  })
})

describe('parseRange', () => {
  it('reads "all" and "max" as the full history', () => {
    for (const value of ['all', 'max']) {
      expect(parseRange(value, TODAY)).toEqual({
        start: DATA_START,
        end: TODAY,
      })
    }
  })

  it('accepts day, week, month and year offsets', () => {
    expect(parseRange('30d', TODAY)?.start).toBe('2026-09-12')
    expect(parseRange('2w', TODAY)?.start).toBe('2026-09-28')
    expect(parseRange('3m', TODAY)?.start).toBe('2026-07-14')
    expect(parseRange('2y', TODAY)?.start).toBe('2024-10-12')
  })

  it('spells all six quick ranges exactly as the presets do', () => {
    // The reason the two endpoints could drift apart unnoticed: the relative
    // grammar covers every preset token, because `1m` *is* 30 days. Asserted
    // rather than assumed, since a changed preset length would break it.
    for (const { key } of PRESETS) {
      expect(parseRange(key, TODAY)).toEqual(presetToRange(key, TODAY))
    }
  })

  it('passes an explicit window straight through, and tolerates padding', () => {
    expect(parseRange('2020-01-01:2021-06-30', TODAY)).toEqual({
      start: '2020-01-01',
      end: '2021-06-30',
    })
    expect(parseRange('  1y  ', TODAY)).toEqual(parseRange('1y', TODAY))
  })

  it('refuses a window that names no real day, or runs backwards', () => {
    // Both would otherwise reach the API and come back as an error rather than
    // a chart.
    expect(parseRange('2026-13-45:2026-13-46', TODAY)).toBeNull()
    expect(parseRange('2026-02-30:2026-03-01', TODAY)).toBeNull()
    expect(parseRange('2026-06-01:2026-01-01', TODAY)).toBeNull()
  })

  it('clamps a relative window that reaches past the first day of data', () => {
    expect(parseRange('50y', TODAY)).toEqual({
      start: DATA_START,
      end: TODAY,
    })
  })

  it('returns null for anything unreadable, and for nothing at all', () => {
    // Null is not a range: the caller decides what "no range" means, and the
    // site and the embed answer that differently on purpose.
    for (const value of ['nonsense', '1', 'y', '1.5y', '2020-01-01', '']) {
      expect(parseRange(value, TODAY)).toBeNull()
    }
    expect(parseRange(null, TODAY)).toBeNull()
    expect(parseRange(undefined, TODAY)).toBeNull()
  })
})

describe('defaultGranularity', () => {
  const at = (days: number) => defaultGranularity(addDays(TODAY, -days), TODAY)

  it('steps daily to weekly to monthly to yearly as the window grows', () => {
    expect(at(10)).toBe('daily')
    expect(at(200)).toBe('weekly')
    expect(at(1000)).toBe('monthly')
    expect(at(5000)).toBe('yearly')
  })

  it('switches exactly at its thresholds', () => {
    expect(at(120)).toBe('daily')
    expect(at(121)).toBe('weekly')
    expect(at(800)).toBe('weekly')
    expect(at(801)).toBe('monthly')
    expect(at(2200)).toBe('monthly')
    expect(at(2201)).toBe('yearly')
  })
})

describe('parseGranularity', () => {
  it('accepts every supported value', () => {
    for (const value of GRANULARITIES) {
      expect(parseGranularity(value)).toBe(value)
    }
  })

  it('returns null for anything else, so the caller can stay auto', () => {
    for (const value of [null, undefined, '', 'hourly', 'DAILY', 'all']) {
      expect(parseGranularity(value)).toBeNull()
    }
  })
})

describe('resolveGranularity', () => {
  it('prefers what was asked for', () => {
    expect(resolveGranularity('yearly', '2026-09-01', TODAY)).toBe('yearly')
  })

  it('derives from the range when nothing was asked for', () => {
    const fallback = defaultGranularity('2026-09-01', TODAY)
    for (const value of [null, '', 'hourly']) {
      expect(resolveGranularity(value, '2026-09-01', TODAY)).toBe(fallback)
    }
  })
})
