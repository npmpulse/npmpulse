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

import { SegmentedControl, Stack, Text } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import type { Granularity } from '../lib/aggregate.ts'
import { formatPeriod } from '../lib/format.ts'
import { DATA_START, todayISO } from '../lib/npm-api.ts'
import { PRESETS, type PresetKey } from '../lib/range.ts'

/**
 * The preset buttons and the custom-range picker are exported separately rather
 * than as one block so both can sit in the same control row as granularity and
 * scale. Together the four controls measure about 750px, so they share one row
 * on a wide screen and wrap onto their own rows on a narrow one.
 */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={600} c="dimmed">
      {children}
    </Text>
  )
}

interface PresetsProps {
  preset: PresetKey
  onPreset: (key: PresetKey) => void
}

export function RangePresets({ preset, onPreset }: PresetsProps) {
  return (
    <Stack gap={4}>
      <FieldLabel>Range</FieldLabel>
      <SegmentedControl
        size="xs"
        // Empty string when the dates were picked by hand, so no preset reads
        // as selected when none of them matches the current window.
        value={preset === 'custom' ? '' : preset}
        onChange={(value) => onPreset(value as PresetKey)}
        data={PRESETS.map((p) => ({ label: p.label, value: p.key }))}
      />
    </Stack>
  )
}

interface CustomRangeProps {
  start: string
  end: string
  onRange: (start: string, end: string) => void
  /**
   * Latest day the picker may offer, as `YYYY-MM-DD`. Defaults to today.
   *
   * A generated page's figures end on the snapshot's last day, not today, so it
   * passes that here -- otherwise the picker would let a reader select days the
   * page has no data for.
   */
  maxDate?: string
}

export function CustomRangePicker({
  start,
  end,
  onRange,
  maxDate = todayISO(),
}: CustomRangeProps) {
  return (
    <Stack gap={4}>
      <FieldLabel>Custom range</FieldLabel>
      <DatePickerInput
        type="range"
        size="xs"
        // Sized to the widest value it shows -- two four-digit dates and the
        // dash between them -- plus the calendar button. Left unset the control
        // fills the whole row and pushes the other three off it.
        w={196}
        valueFormat="MMM D, YYYY"
        value={[start, end]}
        minDate={new Date(`${DATA_START}T00:00:00Z`)}
        maxDate={new Date(`${maxDate}T00:00:00Z`)}
        onChange={(value) => {
          const [nextStart, nextEnd] = value
          if (nextStart && nextEnd) onRange(nextStart, nextEnd)
        }}
        clearable={false}
        aria-label="Custom date range"
      />
    </Stack>
  )
}

/**
 * The span the chart actually draws, named at the granularity it draws it in.
 *
 * Deliberately not the window the controls ask for. `prepareSeries` drops
 * partial periods at both ends, so a monthly chart of a five-year window begins
 * at the first *whole* month inside it and ends at the last, up to a month short
 * of what was requested at each end. Naming that span in days would describe a
 * window the picture does not have -- and the window itself is already on screen
 * in the picker above, so nothing is lost by letting this line describe the
 * drawing instead.
 *
 * Daily and weekly keep the exact day, because for them the boundary genuinely
 * is one: a day's worth of data, or a week starting on its Monday.
 */
export function drawnSpan(
  first: string,
  last: string,
  granularity: Granularity
): string {
  const name = (day: string) =>
    granularity === 'daily' || granularity === 'weekly'
      ? day
      : formatPeriod(day, granularity)
  return `${name(first)} → ${name(last)}`
}
