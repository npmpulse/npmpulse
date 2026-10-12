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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays } from '../lib/npm-api.ts'
import { monthStart } from '../lib/snapshot.ts'
import SnapshotChart, { type SnapshotSeries } from './SnapshotChart.tsx'

const monthly = (start: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    day: monthStart(start, i),
    value: 1000 + i * 10,
  }))

const daily = (start: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    day: addDays(start, i),
    value: 20 + i,
  }))

/** The day the snapshot ends on; presets anchor here, not to today. */
const AS_OF = '2026-10-11'

const series: SnapshotSeries[] = [
  {
    name: 'react',
    monthly: monthly('2016-01-01', 129),
    daily: daily('2026-03-26', 200),
  },
  {
    name: 'vue',
    monthly: monthly('2016-01-01', 129),
    daily: daily('2026-03-26', 200),
  },
]

afterEach(() => {
  delete document.documentElement.dataset.liveChart
})

describe('SnapshotChart', () => {
  it('marks the document so the stylesheet can stand the static chart down', () => {
    render(<SnapshotChart series={series} asOf={AS_OF} />)
    expect(document.documentElement.dataset.liveChart).toBe('ready')
  })

  it('draws the interactive chart', () => {
    const { container } = render(<SnapshotChart series={series} asOf={AS_OF} />)
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })

  it('reads the whole record monthly, matching the static drawing', () => {
    render(<SnapshotChart series={series} asOf={AS_OF} />)
    // Daily is only honest inside the snapshot's daily window, and the default
    // `all` range runs far wider than that.
    expect(screen.getByText('Monthly')).toBeDefined()
    expect(screen.getByText('Yearly')).toBeDefined()
    expect(screen.queryByText('Daily')).toBeNull()
  })

  it('offers the finer granularities once the range fits the daily window', async () => {
    render(<SnapshotChart series={series} asOf={AS_OF} />)
    await userEvent.click(screen.getByText('1M'))
    expect(await screen.findByText('Daily')).toBeDefined()
  })

  it('toggles a series off and back on through the legend', async () => {
    render(<SnapshotChart series={series} asOf={AS_OF} />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide react' }))
    expect(screen.getByRole('button', { name: 'Show react' })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'Show react' }))
    expect(screen.getByRole('button', { name: 'Hide react' })).toBeDefined()
  })

  it('honours an initial log scale', () => {
    const { container } = render(
      <SnapshotChart series={series} asOf={AS_OF} initialScale="log" />
    )
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })
})
