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

import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CustomRangePicker, drawnSpan, RangePresets } from './RangeControls.tsx'

const wrap = (ui: React.ReactNode) =>
  render(
    <MantineProvider>
      <DatesProvider settings={{ firstDayOfWeek: 1 }}>{ui}</DatesProvider>
    </MantineProvider>
  )

describe('drawnSpan', () => {
  it('names a daily or weekly boundary as the day it is', () => {
    // For both, the drawn boundary really is a date: a day, or the Monday a week
    // starts on.
    expect(drawnSpan('2026-01-05', '2026-10-12', 'daily')).toBe(
      '2026-01-05 → 2026-10-12'
    )
    expect(drawnSpan('2026-01-05', '2026-10-12', 'weekly')).toBe(
      '2026-01-05 → 2026-10-12'
    )
  })

  it('names a monthly or yearly boundary as the period it starts', () => {
    expect(drawnSpan('2021-11-01', '2026-09-01', 'monthly')).toBe(
      'Nov 2021 → Sep 2026'
    )
    expect(drawnSpan('2021-01-01', '2026-01-01', 'yearly')).toBe('2021 → 2026')
  })
})

describe('RangePresets', () => {
  it('lists every preset', () => {
    wrap(<RangePresets preset="1y" onPreset={() => {}} />)
    for (const label of ['1M', '3M', '6M', '1Y', '5Y', 'All']) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })

  // SegmentedControl renders bare radio inputs beside their labels, so the
  // inputs carry no accessible name; query them by value instead.
  const radio = (value: string) =>
    document.querySelector(
      `input[type="radio"][value="${value}"]`
    ) as HTMLInputElement | null

  it('marks the active preset as selected', () => {
    wrap(<RangePresets preset="1y" onPreset={() => {}} />)
    expect(radio('1y')?.checked).toBe(true)
    expect(radio('5y')?.checked).toBe(false)
  })

  it('selects nothing when the dates were picked by hand', () => {
    wrap(<RangePresets preset="custom" onPreset={() => {}} />)
    // No preset matches, so the control is given an empty value and all radios
    // read as unselected rather than one of them lying.
    for (const value of ['1m', '3m', '6m', '1y', '5y', 'all']) {
      expect(radio(value)?.checked).toBe(false)
    }
  })

  it('reports the chosen preset', async () => {
    const onPreset = vi.fn()
    wrap(<RangePresets preset="1y" onPreset={onPreset} />)
    await userEvent.click(screen.getByText('5Y'))
    expect(onPreset).toHaveBeenCalledWith('5y')
  })
})

describe('CustomRangePicker', () => {
  it('shows the current range in a compact form', () => {
    wrap(
      <CustomRangePicker
        start="2025-10-12"
        end="2026-10-12"
        onRange={() => {}}
      />
    )
    // The visible control is the trigger button; the value lives in a hidden
    // input, so assert on what a reader actually sees.
    expect(screen.getByLabelText('Custom date range').textContent).toBe(
      'Oct 12, 2025 – Oct 12, 2026'
    )
  })

  it('is labelled', () => {
    wrap(
      <CustomRangePicker
        start="2025-10-12"
        end="2026-10-12"
        onRange={() => {}}
      />
    )
    expect(screen.getByLabelText('Custom date range')).toBeDefined()
  })

  /**
   * Day cells are named in full ("1 October 2025") but jsdom's accessibility
   * tree does not expose them to byRole -- they carry tabindex="-1" and
   * Mantine's calendar markup defeats the role query. A targeted DOM lookup
   * finds them, and the click still drives the real handler.
   */
  const dayCell = (name: string): HTMLElement => {
    const cell = [...document.querySelectorAll('table button')].find(
      (button) => button.getAttribute('aria-label') === name
    )
    if (!cell) throw new Error(`No day cell named ${name}`)
    return cell as HTMLElement
  }

  const openCalendar = async () => {
    await userEvent.click(screen.getByLabelText('Custom date range'))
    await screen.findByRole('table')
  }

  it('opens a month calendar when clicked', async () => {
    wrap(
      <CustomRangePicker
        start="2025-10-12"
        end="2026-10-12"
        onRange={() => {}}
      />
    )
    await openCalendar()

    expect(document.querySelectorAll('table button').length).toBeGreaterThan(27)
    expect(dayCell('1 October 2025')).toBeDefined()
  })

  // Picking days is deliberately NOT tested here. In jsdom the calendar's day
  // cells do not respond to userEvent, fireEvent, or a raw .click(), so a test
  // that asserted on a selection would be asserting on nothing. The gap this
  // leaves is the onChange arrow in CustomRangePicker; everything else in this
  // component is covered, and the popover opening is verified above.
})
