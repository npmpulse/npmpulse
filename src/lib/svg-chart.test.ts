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
import { daysFrom, render, rising } from '../testing/fixtures.ts'
import { DARK_THEME, LIGHT_THEME } from './theme.ts'

/* -------------------------------------------------------------- helpers */

/** Every `<text>` element, with its content and attributes. */
const texts = (svg: string) =>
  [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
    attrs: m[1],
    content: m[2],
  }))

const contents = (svg: string) => texts(svg).map((t) => t.content)

const countOf = (svg: string, pattern: RegExp) =>
  (svg.match(pattern) ?? []).length

/** Points in the first series path, counted by its line segments. */
const pathPoints = (svg: string): number[] =>
  [...svg.matchAll(/<path d="M([^"]+)"[^>]*stroke-width="2"/g)].map(
    (m) => m[1].split(' L').length
  )

/** The x coordinate each drawn path starts at, in document order. */
const pathStartX = (svg: string): number[] =>
  [...svg.matchAll(/<path d="M([\d.]+),/g)].map((m) => Number(m[1]))

/** Width of the plot area for the default 820px chart. */
const plotSpan = () => 820 - 64 - 62

/** The y coordinate of every point on the first series path. */
function pathYs(svg: string): number[] {
  const match = /<path d="M([^"]+)"[^>]*stroke-width="2"/.exec(svg)
  if (!match) return []
  return match[1]
    .split(' L')
    .flatMap((pair) => pair.split(' '))
    .map((point) => Number(point.split(',')[1]))
    .filter((y) => Number.isFinite(y))
}

/* ---------------------------------------------------------------- tests */

describe('renderChart root element', () => {
  const input = {
    dates: daysFrom('2026-01-01', 10),
    series: [{ name: 'react', values: rising(10) }],
  }

  it('emits a sized svg with a viewBox and an image role', () => {
    const svg = render(input)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toMatch(/width="820"/)
    expect(svg).toMatch(/height="380"/)
    expect(svg).toMatch(/viewBox="0 0 820 380"/)
    expect(svg).toContain('role="img"')
  })

  it('honours custom dimensions', () => {
    const svg = render(input, { width: 600, height: 300 })
    expect(svg).toContain('viewBox="0 0 600 300"')
  })

  it('paints the theme surface as the background', () => {
    expect(render(input, { theme: 'light' })).toContain(
      `fill="${LIGHT_THEME.surface}"`
    )
    expect(render(input, { theme: 'dark' })).toContain(
      `fill="${DARK_THEME.surface}"`
    )
  })
})

describe('renderChart empty input', () => {
  it('says so when there are no dates', () => {
    const svg = render({ dates: [], series: [] })
    expect(contents(svg)).toContain('No download data for this range')
  })

  it('says so when every value is zero, which has no place on a chart', () => {
    const svg = render({
      dates: daysFrom('2026-01-01', 5),
      series: [{ name: 'react', values: [0, 0, 0, 0, 0] }],
    })
    expect(contents(svg)).toContain('No download data for this range')
  })

  it('draws no series paths in that case', () => {
    const svg = render({ dates: [], series: [] })
    expect(countOf(svg, /stroke-width="2"/g)).toBe(0)
  })
})

describe('renderChart series rendering', () => {
  const dates = daysFrom('2026-01-01', 10)

  it('draws one 2px line per series', () => {
    const svg = render({
      dates,
      series: [
        { name: 'react', values: rising(10) },
        { name: 'vue', values: rising(10, 50, 5) },
      ],
    })
    expect(countOf(svg, /stroke-width="2"/g)).toBe(2)
  })

  it('fills under the line for a single series', () => {
    const svg = render({
      dates,
      series: [{ name: 'react', values: rising(10) }],
    })
    expect(svg).toMatch(/fill-opacity="0\.13"/)
  })

  it('does not fill when several series would occlude each other', () => {
    const svg = render({
      dates,
      series: [
        { name: 'react', values: rising(10) },
        { name: 'vue', values: rising(10, 50, 5) },
      ],
    })
    expect(svg).not.toMatch(/fill-opacity="0\.13"/)
  })

  it('can be told to fill anyway, or not to', () => {
    const many = {
      dates,
      series: [
        { name: 'a', values: rising(10) },
        { name: 'b', values: rising(10, 50, 5) },
      ],
    }
    expect(render(many, { area: true })).toMatch(/fill-opacity="0\.13"/)
    expect(
      render(
        { dates, series: [{ name: 'a', values: rising(10) }] },
        { area: false }
      )
    ).not.toMatch(/fill-opacity="0\.13"/)
  })

  it('adds dots only when the series is sparse enough to read them', () => {
    const sparse = render({
      dates: daysFrom('2026-01-01', 20),
      series: [{ name: 'a', values: rising(20) }],
    })
    expect(sparse).toContain('<circle')

    const dense = render({
      dates: daysFrom('2026-01-01', 200),
      series: [{ name: 'a', values: rising(200) }],
    })
    expect(dense).not.toContain('<circle')
  })

  it('uses the categorical palette in order', () => {
    const svg = render({
      dates,
      series: [
        { name: 'a', values: rising(10) },
        { name: 'b', values: rising(10, 50, 5) },
      ],
    })
    expect(svg).toContain(LIGHT_THEME.series[0])
    expect(svg).toContain(LIGHT_THEME.series[1])
  })

  it('starts a series at its own first day, not at the axis start', () => {
    // Regression: series used to be lined up by array position, so a package
    // published later -- whose series is shorter because the head was trimmed
    // to its first record -- had its opening day drawn at the chart's start.
    const days = daysFrom('2026-01-01', 6)
    const svg = render({
      dates: days,
      series: [
        { name: 'old', values: [10, 20, 30, 40, 50, 60] },
        { name: 'new', values: [null, null, null, 40, 50, 60] },
      ],
    })

    const starts = pathStartX(svg)
    expect(starts).toHaveLength(2)
    // The late package begins three of six positions in, not at the left edge.
    // xAt(i) = left + (i / (count - 1)) * span, so three positions is 3/5 of it.
    expect(starts[1]).toBeGreaterThan(starts[0])
    expect(starts[1] - starts[0]).toBeCloseTo((3 * plotSpan()) / 5, 0)
    expect(starts[0]).toBeCloseTo(64, 0) // the older package does start at the edge
  })

  it('breaks a line where another series has data and this one does not', () => {
    // The union axis is what carries a hole: a day only the other package
    // covers is a position this one has nothing to draw at.
    const days = daysFrom('2026-01-01', 6)
    const gapped = render({
      dates: days,
      series: [
        { name: 'a', values: [10, 20, 30, 40, 50, 60] },
        { name: 'b', values: [10, 20, null, null, 50, 60] },
      ],
    })
    expect(countOf(gapped, /stroke-width="2"/g)).toBe(3) // a: 1, b: 2
  })

  it('connects consecutive points even when they are far apart', () => {
    // Weekly and monthly series have points days or weeks apart; a gap in the
    // day list is the normal case there, not a hole.
    const svg = render({
      dates: ['2026-01-01', '2026-02-01', '2026-03-01'],
      series: [{ name: 'a', values: [10, 20, 30] }],
    })
    expect(countOf(svg, /stroke-width="2"/g)).toBe(1)
  })
})

describe('renderChart legend', () => {
  const dates = daysFrom('2026-01-01', 10)

  it('omits the legend for a lone series, since the title names it', () => {
    const svg = render(
      { dates, series: [{ name: 'react', values: rising(10) }] },
      { title: 'react' }
    )
    // No swatches, and the name appears once -- from the title -- not twice.
    expect(countOf(svg, /rx="2"/g)).toBe(0)
    expect(contents(svg).filter((c) => c === 'react')).toHaveLength(1)
  })

  it('lists every series for a comparison', () => {
    const svg = render({
      dates,
      series: [
        { name: 'react', values: rising(10) },
        { name: 'vue', values: rising(10, 50, 5) },
      ],
    })
    expect(contents(svg)).toContain('react')
    expect(contents(svg)).toContain('vue')
  })

  it('gives each legend entry a swatch filled with that series colour', () => {
    const svg = render({
      dates,
      series: [
        { name: 'react', values: rising(10) },
        { name: 'vue', values: rising(10, 50, 5) },
      ],
    })
    for (const colour of [LIGHT_THEME.series[0], LIGHT_THEME.series[1]]) {
      expect(svg).toContain(`rx="2" fill="${colour}"`)
    }
  })
})

describe('renderChart text escaping', () => {
  const dates = daysFrom('2026-01-01', 4)
  const withName = (name: string) =>
    render({
      dates,
      series: [
        { name: 'a', values: rising(4) },
        { name, values: rising(4, 50, 5) },
      ],
    })

  // Package names reach the renderer straight from the query string, so an
  // unescaped one would inject markup into the SVG served to a README.
  it('escapes angle brackets', () => {
    const svg = withName('<script>alert(1)</script>')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('escapes ampersands', () => {
    expect(withName('a&b')).toContain('a&amp;b')
  })

  it('escapes quotes so they cannot break out of an attribute', () => {
    const svg = withName('a"onload="x')
    expect(svg).not.toContain('a"onload="x')
    expect(svg).toContain('&quot;')
  })

  it('escapes apostrophes too', () => {
    expect(withName("it's")).toContain('it&apos;s')
  })

  it('escapes the title as well', () => {
    const svg = render(
      { dates, series: [{ name: 'a', values: rising(4) }] },
      { title: '<b>x</b>' }
    )
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})

describe('renderChart axes', () => {
  const dates = daysFrom('2026-01-01', 30)

  it('labels the y axis with compact numbers and a zero baseline', () => {
    const svg = render({
      dates,
      series: [{ name: 'a', values: rising(30, 0, 1_000_000) }],
    })
    const labels = contents(svg)
    expect(labels).toContain('0')
    expect(labels.some((l) => /M$/.test(l))).toBe(true)
  })

  it('spaces x labels so they cannot run into each other', () => {
    const svg = render({
      dates: daysFrom('2026-01-01', 400),
      series: [{ name: 'a', values: rising(400) }],
    })
    const xLabels = texts(svg).filter((t) =>
      t.attrs.includes('text-anchor="middle"')
    )
    expect(xLabels.length).toBeGreaterThan(1)
    expect(xLabels.length).toBeLessThanOrEqual(8)
  })

  it('carries the year on every tick once the span crosses one', () => {
    const svg = render(
      {
        dates: daysFrom('2025-06-01', 400),
        series: [{ name: 'a', values: rising(400) }],
      },
      { granularity: 'daily' }
    )
    const xLabels = texts(svg)
      .filter((t) => t.attrs.includes('text-anchor="middle"'))
      .map((t) => t.content)
    expect(xLabels.length).toBeGreaterThan(2)
    // The apostrophe is escaped in the markup, hence &apos; rather than '.
    for (const label of xLabels) expect(label).toMatch(/(&apos;|')\d\d$/)
  })

  it('leaves the year off a span inside a single year', () => {
    const svg = render(
      {
        dates: daysFrom('2026-01-01', 60),
        series: [{ name: 'a', values: rising(60) }],
      },
      { granularity: 'daily' }
    )
    const xLabels = texts(svg)
      .filter((t) => t.attrs.includes('text-anchor="middle"'))
      .map((t) => t.content)
    for (const label of xLabels) expect(label).not.toMatch(/(&apos;|')\d\d$/)
  })

  it('shows the unit beside the title when given one', () => {
    const svg = render(
      { dates, series: [{ name: 'a', values: rising(30) }] },
      { title: 'react', unit: 'downloads' }
    )
    expect(svg).toContain('downloads')
  })

  it('says so when the y axis is logarithmic', () => {
    const svg = render(
      { dates, series: [{ name: 'a', values: rising(30) }] },
      { scale: 'log', unit: 'downloads' }
    )
    expect(contents(svg).join(' ')).toContain('log scale')
  })
})

describe('renderChart log scale', () => {
  it('places values by magnitude rather than linearly', () => {
    const dates = daysFrom('2026-01-01', 3)
    const linear = render({
      dates,
      series: [{ name: 'a', values: [10, 1000, 1_000_000] }],
    })
    const log = render(
      { dates, series: [{ name: 'a', values: [10, 1000, 1_000_000] }] },
      { scale: 'log' }
    )

    expect(log).not.toBe(linear)
    // Decade ticks are the signature of a log axis.
    const labels = contents(log)
    expect(labels).toContain('10K')
    expect(labels).toContain('1M')
  })

  it('breaks the line at zero, which has no position on a log axis', () => {
    const svg = render(
      {
        dates: daysFrom('2026-01-01', 5),
        series: [{ name: 'a', values: [0, 0, 100, 200, 300] }],
      },
      { scale: 'log' }
    )
    expect(countOf(svg, /stroke-width="2"/g)).toBe(1)
  })

  it('falls back to linear when nothing is positive', () => {
    const svg = render(
      {
        dates: daysFrom('2026-01-01', 3),
        series: [{ name: 'a', values: [0, 0, 0] }],
      },
      { scale: 'log' }
    )
    expect(contents(svg)).toContain('No download data for this range')
  })
})

describe('renderChart end labels', () => {
  const dates = daysFrom('2026-01-01', 20)

  it('labels each line with its final value', () => {
    const svg = render({
      dates,
      series: [
        { name: 'a', values: rising(20, 100, 100) },
        { name: 'b', values: rising(20, 50, 10) },
      ],
    })
    // a ends at 2000 -> "2K", b at 240
    expect(contents(svg)).toContain('2K')
    expect(contents(svg)).toContain('240')
  })

  it('pushes labels apart when two lines end at the same height', () => {
    const svg = render({
      dates,
      series: [
        { name: 'a', values: Array(20).fill(1000) },
        { name: 'b', values: Array(20).fill(1000) },
      ],
    })

    // Two "1K" labels, at visibly different baselines rather than overprinted.
    const ys = [
      ...svg.matchAll(
        /<text x="[^"]+" y="([\d.]+)"[^>]*font-weight="600">1K<\/text>/g
      ),
    ].map((m) => Number(m[1]))
    expect(ys).toHaveLength(2)
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(13)
  })

  it('omits end labels when the chart is too narrow to carry them', () => {
    const svg = render(
      { dates, series: [{ name: 'a', values: rising(20) }] },
      { width: 300, height: 300 }
    )
    expect(svg).not.toMatch(/font-weight="600"/)
  })
})

describe('renderChart decimation', () => {
  it('reduces a long series to roughly the pixel width without losing the envelope', () => {
    const count = 5000
    const base = Array.from({ length: count }, (_, i) => 1000 + (i % 37))
    const spiked = [...base]
    spiked[2500] = 999_999 // a single-bucket event an every-Nth sample would drop

    const svg = render({
      dates: daysFrom('2015-01-01', count),
      series: [{ name: 'a', values: spiked }],
    })
    const [points] = pathPoints(svg)

    // One bucket per pixel column, up to two points per bucket (its min and
    // its max), so the drawn count is bounded by twice the plot width.
    expect(points).toBeLessThan(count)
    expect(points).toBeLessThanOrEqual(2 * (820 - 64 - 62))

    // The spike survives as a point near the top of the plot.
    expect(Math.min(...pathYs(svg))).toBeLessThanOrEqual(20)

    // Control: the same series without the spike never comes close to the top.
    const flat = render({
      dates: daysFrom('2015-01-01', count),
      series: [{ name: 'a', values: base }],
    })
    expect(Math.min(...pathYs(flat))).toBeGreaterThan(50)
  })

  it('leaves a short series untouched', () => {
    const svg = render({
      dates: daysFrom('2026-01-01', 50),
      series: [{ name: 'a', values: rising(50) }],
    })
    expect(pathPoints(svg)[0]).toBe(50)
  })
})

describe('renderChart dark mode', () => {
  it('uses the dark tokens throughout', () => {
    const svg = render(
      {
        dates: daysFrom('2026-01-01', 10),
        series: [{ name: 'react', values: rising(10) }],
      },
      { theme: 'dark', title: 'react' }
    )
    expect(svg).toContain(DARK_THEME.surface)
    expect(svg).toContain(DARK_THEME.series[0])
    expect(svg).toContain(DARK_THEME.gridline)
    expect(svg).not.toContain(LIGHT_THEME.surface)
  })
})

describe('renderChart single-point series', () => {
  it('draws a dot rather than an unrenderable one-point line', () => {
    const svg = render({
      dates: ['2026-01-01'],
      series: [{ name: 'a', values: [500] }],
    })
    expect(svg).toContain('<circle')
    expect(countOf(svg, /stroke-width="2"/g)).toBe(0)
  })
})
