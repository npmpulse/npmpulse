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
import { DARK_THEME, LIGHT_THEME, seriesColor, themeFor } from './theme.ts'

describe('themeFor', () => {
  it('returns the matching token set', () => {
    expect(themeFor('light')).toBe(LIGHT_THEME)
    expect(themeFor('dark')).toBe(DARK_THEME)
  })

  it('defaults to light for anything that is not dark', () => {
    expect(themeFor('nonsense' as 'light')).toBe(LIGHT_THEME)
  })
})

describe('theme tokens', () => {
  it('gives both modes the same number of series slots', () => {
    expect(LIGHT_THEME.series).toHaveLength(8)
    expect(DARK_THEME.series).toHaveLength(8)
  })

  it('uses different hues per mode, since dark is re-stepped not flipped', () => {
    expect(LIGHT_THEME.series[0]).not.toBe(DARK_THEME.series[0])
    expect(LIGHT_THEME.surface).not.toBe(DARK_THEME.surface)
  })

  it('keeps every colour a plain hex value', () => {
    for (const mode of [LIGHT_THEME, DARK_THEME]) {
      for (const value of [
        mode.surface,
        mode.textPrimary,
        mode.gridline,
        mode.axis,
        ...mode.series,
      ]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})

describe('seriesColor', () => {
  it('assigns slots in fixed order', () => {
    expect(seriesColor(LIGHT_THEME, 0)).toBe(LIGHT_THEME.series[0])
    expect(seriesColor(LIGHT_THEME, 3)).toBe(LIGHT_THEME.series[3])
  })

  it('wraps rather than returning undefined past the last slot', () => {
    expect(seriesColor(LIGHT_THEME, 8)).toBe(LIGHT_THEME.series[0])
    expect(seriesColor(LIGHT_THEME, 11)).toBe(LIGHT_THEME.series[3])
  })
})
