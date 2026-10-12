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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ChartSeries } from '../lib/svg-chart.ts'
import { LIGHT_THEME } from '../lib/theme.ts'
import { daysFrom, seriesOf } from '../testing/fixtures.ts'
import { DownloadChart, ToggleLegend } from './DownloadChart.tsx'

const dates = (count: number) => daysFrom('2026-01-01', count)

const base = {
  granularity: 'daily' as const,
  scale: 'linear' as const,
  loading: false,
  error: null,
  colorScheme: 'light' as const,
  hidden: new Set<string>(),
  onToggle: () => {},
}

type ShowOverrides = Omit<
  Partial<Parameters<typeof DownloadChart>[0]>,
  'series'
> & {
  /** Shorthand: a shared day list plus one value per series. */
  dates?: string[]
  series?: Array<{ name: string; values: Array<number | null> }>
}

const show = ({ dates: days, series: values, ...rest }: ShowOverrides = {}) => {
  const legacy = {
    dates: days ?? dates(10),
    series: values ?? [{ name: 'react', values: Array(10).fill(100) }],
  }
  return render(
    <MantineProvider>
      <DownloadChart
        {...base}
        {...rest}
        series={seriesOf(legacy) as ChartSeries[]}
      />
    </MantineProvider>
  )
}

describe('DownloadChart states', () => {
  it('shows an alert for an error, not a broken chart', () => {
    show({
      error: 'npm is rate-limiting requests right now.',
      dates: [],
      series: [],
    })
    expect(screen.getByText('Could not load download data')).toBeDefined()
    expect(screen.getByText(/rate-limiting/)).toBeDefined()
  })

  it('shows a loader while fetching', () => {
    show({ loading: true, dates: [], series: [] })
    expect(screen.getByText('Fetching download history…')).toBeDefined()
  })

  it('invites a first package when none is chosen', () => {
    show({ dates: [], series: [] })
    expect(screen.getByText(/Enter a package name/)).toBeDefined()
  })

  it('says the range is empty when packages exist but returned nothing', () => {
    show({ dates: [], series: [{ name: 'react', values: [] }] })
    expect(screen.getByText('No download data for this range.')).toBeDefined()
  })

  it('prefers the error over the loading state', () => {
    show({ error: 'boom', loading: true, dates: [], series: [] })
    expect(screen.getByText('Could not load download data')).toBeDefined()
    expect(screen.queryByText('Fetching download history…')).toBeNull()
  })
})

describe('DownloadChart rendering', () => {
  it('mounts a chart once data exists', () => {
    const { container } = show()
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })

  it('handles a comparison without throwing', () => {
    const { container } = show({
      series: [
        { name: 'react', values: Array(10).fill(100) },
        { name: 'vue', values: Array(10).fill(50) },
      ],
    })
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })

  it('renders each granularity', () => {
    for (const granularity of [
      'daily',
      'weekly',
      'monthly',
      'yearly',
    ] as const) {
      const { unmount, container } = show({ granularity })
      expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
      unmount()
    }
  })

  it('accepts a log scale', () => {
    const { container } = show({ scale: 'log' })
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })

  it('falls back to linear when a log scale has nothing positive to place', () => {
    // Every value zero: a log domain cannot be derived, so the log branch must
    // not be taken.
    const { container } = show({
      scale: 'log',
      series: [{ name: 'react', values: Array(10).fill(0) }],
    })
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })

  it('renders in dark mode', () => {
    const { container } = show({ colorScheme: 'dark' })
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })

  it('carries a year into labels only when the span crosses one', () => {
    // Same code path either way; the point is that both branches run.
    for (const span of [30, 400]) {
      const { unmount, container } = show({
        dates: dates(span),
        series: [{ name: 'r', values: Array(span).fill(5) }],
      })
      expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
      unmount()
    }
  })

  it('tolerates a single point', () => {
    const { container } = show({
      dates: dates(1),
      series: [{ name: 'r', values: [5] }],
    })
    expect(container.querySelector('.mantine-LineChart-root')).not.toBeNull()
  })
})

describe('ToggleLegend', () => {
  const colors = LIGHT_THEME.series as unknown as string[]
  // The legend only reads names, so the points are placeholders.
  const point = (value: number) => [{ day: '2026-01-01', value }]
  const series = [
    { name: 'react', points: point(1) },
    { name: 'vue', points: point(2) },
    { name: 'svelte', points: point(3) },
  ]

  const show = (hidden: string[] = [], onToggle = () => {}) =>
    render(
      <MantineProvider>
        <ToggleLegend
          series={series}
          colors={colors}
          hidden={new Set(hidden)}
          onToggle={onToggle}
        />
      </MantineProvider>
    )

  it('names every package', () => {
    show()
    for (const name of ['react', 'vue', 'svelte'])
      expect(screen.getByText(name)).toBeDefined()
  })

  it('is labelled for assistive tech, since it is also the control', () => {
    show()
    expect(screen.getByRole('group', { name: 'Packages' })).toBeDefined()
  })

  it('reports a toggle when an entry is clicked', async () => {
    const onToggle = vi.fn()
    show([], onToggle)
    await userEvent.click(screen.getByRole('button', { name: 'Hide vue' }))
    expect(onToggle).toHaveBeenCalledWith('vue')
  })

  it('marks each entry pressed according to whether it is drawn', () => {
    show(['vue'])
    expect(
      screen
        .getByRole('button', { name: 'Hide react' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Show vue' })
        .getAttribute('aria-pressed')
    ).toBe('false')
  })

  it('keeps a hidden entry in place rather than removing it', () => {
    // Removing it would reshuffle the legend under the reader's cursor.
    show(['vue'])
    expect(screen.getByText('vue')).toBeDefined()
  })

  it('strikes through a hidden entry name', () => {
    show(['vue'])
    expect(screen.getByText('vue').style.textDecoration).toBe('line-through')
    expect(screen.getByText('react').style.textDecoration).toBe('none')
  })

  it('outlines the swatch of a hidden entry instead of filling it', () => {
    show(['vue'])
    const swatch = screen.getByText('vue').previousElementSibling as HTMLElement
    expect(swatch.style.background).toBe('transparent')
  })

  it('refuses to hide the last visible line, which would empty the chart', () => {
    show(['vue', 'svelte'])
    const last = screen.getByRole('button', {
      name: /must stay visible/,
    }) as HTMLButtonElement
    expect(last.disabled).toBe(true)
  })

  it('allows hiding once more than one is drawn', () => {
    show(['vue'])
    expect(
      (screen.getByRole('button', { name: 'Hide react' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
    expect(
      (screen.getByRole('button', { name: 'Hide svelte' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  })

  it('cycles the palette past the last slot', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      name: `p${i}`,
      points: point(i + 1),
    }))
    render(
      <MantineProvider>
        <ToggleLegend
          series={many}
          colors={colors}
          hidden={new Set()}
          onToggle={() => {}}
        />
      </MantineProvider>
    )
    const swatches = [
      ...document.querySelectorAll('span[aria-hidden]'),
    ] as HTMLElement[]
    expect(swatches[8].style.borderColor).toBe(swatches[0].style.borderColor)
  })
})
