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

import type { Granularity } from './aggregate.ts'
import {
  addDays,
  clampStart,
  DATA_START,
  dayDiff,
  isValidDay,
  todayISO,
} from './npm-api.ts'

export type PresetKey = '1m' | '3m' | '6m' | '1y' | '5y' | 'all' | 'custom'

export interface Preset {
  key: Exclude<PresetKey, 'custom'>
  label: string
  days: number | null
}

export const PRESETS: readonly Preset[] = [
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 180 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '5y', label: '5Y', days: 1825 },
  { key: 'all', label: 'All', days: null },
]

export interface DateRange {
  start: string
  end: string
}

export function presetToRange(
  key: Exclude<PresetKey, 'custom'>,
  today = todayISO()
): DateRange {
  const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[3]
  if (preset.days === null) return { start: DATA_START, end: today }
  const start = addDays(today, -preset.days)
  return { start: start < DATA_START ? DATA_START : start, end: today }
}

/** Which preset (if any) a concrete range corresponds to. */
export function detectPreset(
  { start, end }: DateRange,
  today = todayISO()
): PresetKey {
  if (end !== today) return 'custom'
  for (const preset of PRESETS) {
    if (preset.days === null) {
      if (start === DATA_START) return 'all'
      continue
    }
    if (presetToRange(preset.key, today).start === start) return preset.key
  }
  return 'custom'
}

/* ------------------------------------------------------------- the `range` */

/**
 * Every granularity the UI can draw, in ascending order of coarseness.
 *
 * The list is also what a `granularity` parameter is validated against, which
 * is why it lives here rather than in the component that renders a toggle for
 * it.
 */
export const GRANULARITIES: readonly Granularity[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
]

const UNIT_DAYS = { d: 1, w: 7, m: 30, y: 365 } as const
const RELATIVE = /^(\d+)([dwmy])$/
const EXPLICIT = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/

/**
 * Parse a `range` value.
 *
 * Shared by the site and the embed so the same URL means the same window on
 * both: a link written for one can have its path swapped for the other's and
 * still draw what it drew. Accepted forms:
 *
 *   `all`, `max`              the whole record
 *   `<n>d`, `<n>w`, `<n>m`, `<n>y`   a window ending today
 *   `YYYY-MM-DD:YYYY-MM-DD`   an explicit window
 *
 * The six quick ranges need no separate case: `1m` is 30 days by definition,
 * and the day/week/month/year grammar happens to spell all six the same way.
 *
 * Returns null for an absent or unreadable value. Those are one answer here on
 * purpose -- "no range" is a question for the caller, and the two callers
 * answer it differently: the site lands on its five-year default, an embed on
 * one year. Nothing recognised means nothing to honour either way.
 */
export function parseRange(
  value: string | null | undefined,
  today = todayISO()
): DateRange | null {
  const token = (value ?? '').trim()
  if (!token) return null

  if (token === 'all' || token === 'max') {
    return { start: DATA_START, end: today }
  }

  const explicit = EXPLICIT.exec(token)
  if (explicit) {
    const [, start, end] = explicit
    // The shape alone is not enough. `2026-13-45` matches it and describes no
    // day at all, and a reversed window asks for nothing -- both would reach
    // the API and come back as an error rather than a chart.
    if (!isValidDay(start) || !isValidDay(end) || start > end) return null
    return { start, end }
  }

  const relative = RELATIVE.exec(token)
  if (relative) {
    const unit = relative[2] as keyof typeof UNIT_DAYS
    const days = Number(relative[1]) * UNIT_DAYS[unit]
    // Clamped like the presets are: `10y` reaches past the first day npm has
    // records for, and the API answers nothing before it.
    return { start: clampStart(addDays(today, -days)), end: today }
  }

  return null
}

/**
 * The granularity a range can show without the axis turning to mush.
 *
 * A quarter of daily ticks is unreadable; a decade of weekly ones is pointless.
 */
export function defaultGranularity(start: string, end: string): Granularity {
  const days = dayDiff(start, end)
  if (days <= 120) return 'daily'
  if (days <= 800) return 'weekly'
  if (days <= 2200) return 'monthly'
  return 'yearly'
}

/** The granularity asked for, or null when absent or not one of the four. */
export function parseGranularity(
  value: string | null | undefined
): Granularity | null {
  const token = (value ?? '').trim()
  return GRANULARITIES.includes(token as Granularity)
    ? (token as Granularity)
    : null
}

/** What the caller asked for, else whatever the range can show. */
export function resolveGranularity(
  value: string | null | undefined,
  start: string,
  end: string
): Granularity {
  return parseGranularity(value) ?? defaultGranularity(start, end)
}
