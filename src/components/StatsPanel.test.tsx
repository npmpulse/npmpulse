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
import { describe, expect, it } from 'vitest'
import { LIGHT_THEME } from '../lib/theme.ts'
import { type PackageStat, StatsPanel } from './StatsPanel.tsx'

const stat = (name: string, over: Partial<PackageStat> = {}): PackageStat => ({
  name,
  total: 1000,
  latest: 100,
  peak: 200,
  periods: 30,
  ...over,
})

const show = (
  stats: PackageStat[],
  extra: Partial<Parameters<typeof StatsPanel>[0]> = {}
) =>
  render(
    <MantineProvider>
      <StatsPanel
        stats={stats}
        theme={LIGHT_THEME}
        granularity="monthly"
        requests={1}
        fromCache={false}
        {...extra}
      />
    </MantineProvider>
  )

describe('StatsPanel', () => {
  it('renders nothing without packages', () => {
    const { container } = show([])
    expect(container.querySelector('table')).toBeNull()
  })

  it('gives every package a row', () => {
    show([stat('react'), stat('vue'), stat('svelte')])
    for (const name of ['react', 'vue', 'svelte']) {
      expect(screen.getByText(name)).toBeDefined()
    }
    expect(screen.getAllByRole('row')).toHaveLength(4) // header + 3
  })

  it('formats each figure compactly', () => {
    show([
      stat('react', {
        total: 5_800_000_000,
        latest: 224_000_000,
        peak: 842_000_000,
      }),
    ])
    expect(screen.getByText('5.8B')).toBeDefined()
    expect(screen.getByText('224M')).toBeDefined()
    expect(screen.getByText('842M')).toBeDefined()
  })

  it('labels the columns', () => {
    show([stat('react')])
    expect(screen.getByText('Package')).toBeDefined()
    expect(screen.getByText('Total')).toBeDefined()
    expect(screen.getByText('Latest')).toBeDefined()
    expect(screen.getByText('Peak')).toBeDefined()
  })

  it('summarises the window below the table', () => {
    show([stat('react', { periods: 51 })], {
      requests: 2,
      granularity: 'weekly',
    })
    expect(screen.getByText(/51 weekly periods/)).toBeDefined()
    expect(screen.getByText(/2 requests/)).toBeDefined()
  })

  it('singularises a single request', () => {
    show([stat('react')], { requests: 1 })
    expect(screen.getByText(/1 request$/)).toBeDefined()
  })

  it('says when the figures came from the cache', () => {
    show([stat('react')], { fromCache: true, requests: 0 })
    expect(screen.getByText(/cached/)).toBeDefined()
  })

  it('omits the request summary when no request count is known', () => {
    show([stat('react')], { requests: null })
    expect(screen.queryByText(/request/)).toBeNull()
  })
})

describe('StatsPanel share bars', () => {
  const barWidths = () =>
    [...document.querySelectorAll('table tbody tr')].map((row) => {
      const fill = row.querySelectorAll('td')[1]?.querySelector('div > div') as
        | HTMLElement
        | undefined
      return fill?.style.width ?? null
    })

  it('draws no bars for a lone package, which has nothing to be relative to', () => {
    show([stat('react')])
    expect(barWidths()).toEqual([null])
  })

  it('sizes each bar against the largest total', () => {
    show([
      stat('react', { total: 1000 }),
      stat('vue', { total: 500 }),
      stat('svelte', { total: 100 }),
    ])
    expect(barWidths()).toEqual(['100%', '50%', '10%'])
  })

  it('fills the largest bar completely, anchoring the scale', () => {
    show([stat('a', { total: 10 }), stat('b', { total: 90 })])
    expect(barWidths()).toEqual(['11.11111111111111%', '100%'])
  })

  it('copes with every total being zero', () => {
    show([stat('a', { total: 0 }), stat('b', { total: 0 })])
    expect(barWidths()).toEqual(['0%', '0%'])
  })

  it('hides the bars from assistive tech, since the figures carry the data', () => {
    show([stat('a', { total: 10 }), stat('b', { total: 5 })])
    const bar = document.querySelector(
      'table tbody tr td:nth-child(2) div'
    ) as HTMLElement
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.getAttribute('title')).toContain('of the largest total')
  })

  it('cycles the palette when there are more packages than slots', () => {
    show(Array.from({ length: 10 }, (_, i) => stat(`p${i}`)))
    const dots = [
      ...document.querySelectorAll('table tbody tr td:first-child span'),
    ] as HTMLElement[]
    expect(dots).toHaveLength(10)
    expect(dots[8].style.background).toBe(dots[0].style.background)
  })
})
