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
 * Chart theme tokens, light and dark.
 *
 * Values come from the validated reference palette. The categorical series
 * slots are assigned in fixed order and never cycled, and the dark column is
 * the same eight hues re-stepped for the dark surface rather than an
 * automatic flip. Both sets pass the palette validator's lightness band,
 * chroma floor, CVD separation and normal-vision checks; light mode carries a
 * sub-3:1 contrast warning on three slots, which is why a legend is always
 * drawn for multi-series charts and values are labelled directly.
 */

export type ThemeMode = 'light' | 'dark'

export interface ChartTheme {
  surface: string
  textPrimary: string
  textSecondary: string
  /** Axis labels and other deliberately recessive ink. */
  muted: string
  gridline: string
  axis: string
  series: readonly string[]
}

export const LIGHT_THEME: ChartTheme = {
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  gridline: '#e1e0d9',
  axis: '#c3c2b7',
  series: [
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#6250d6',
    '#e34948',
  ],
}

export const DARK_THEME: ChartTheme = {
  surface: '#1a1a19',
  textPrimary: '#f0efec',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  axis: '#383835',
  series: [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
  ],
}

export function themeFor(mode: ThemeMode): ChartTheme {
  return mode === 'dark' ? DARK_THEME : LIGHT_THEME
}

/** Categorical slot for series `index`, in fixed order. */
export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.series[index % theme.series.length]
}
