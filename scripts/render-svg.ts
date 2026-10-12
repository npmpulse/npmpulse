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

import { mkdirSync, writeFileSync } from 'node:fs'
import { type Granularity, prepareSeries } from '../src/lib/aggregate.ts'
import {
  DATA_START,
  fetchDownloads,
  type SeriesMap,
  todayISO,
} from '../src/lib/npm-api.ts'
import {
  type ChartInput,
  type RenderOptions,
  renderChart,
} from '../src/lib/svg-chart.ts'

const out = '/tmp/npmpulse-render'
mkdirSync(out, { recursive: true })
const today = todayISO()

/**
 * Each series carries its own points rather than a shared date column: series
 * do not all start together, so the head of each is trimmed to where that
 * package's records actually begin.
 */
const build = (
  series: SeriesMap,
  names: string[],
  g: Granularity
): ChartInput => ({
  series: names.map((name) => ({
    name,
    points: prepareSeries(series[name] ?? [], { granularity: g }).points.map(
      (point) => ({ day: point.day, value: point.downloads })
    ),
  })),
})

const one = await fetchDownloads(['react'], { start: DATA_START, end: today })
const multiNames = ['react', 'vue', 'svelte', 'solid-js']
const multi = await fetchDownloads(multiNames, {
  start: '2019-01-01',
  end: today,
})

const single = build(one.series, ['react'], 'monthly')
const many = build(multi.series, multiNames, 'monthly')

const jobs: Array<[string, ChartInput, RenderOptions]> = [
  [
    'single-linear',
    single,
    {
      theme: 'light',
      granularity: 'monthly',
      title: 'react',
      unit: 'downloads',
      scale: 'linear',
    },
  ],
  [
    'single-log',
    single,
    {
      theme: 'light',
      granularity: 'monthly',
      title: 'react',
      unit: 'downloads',
      scale: 'log',
    },
  ],
  [
    'multi-linear',
    many,
    {
      theme: 'light',
      granularity: 'monthly',
      title: 'Monthly downloads',
      unit: 'downloads',
      scale: 'linear',
    },
  ],
  [
    'multi-log',
    many,
    {
      theme: 'light',
      granularity: 'monthly',
      title: 'Monthly downloads',
      unit: 'downloads',
      scale: 'log',
    },
  ],
  [
    'multi-dark-log',
    many,
    {
      theme: 'dark',
      granularity: 'monthly',
      title: 'Monthly downloads',
      unit: 'downloads',
      scale: 'log',
    },
  ],
  [
    'single-dark-log',
    single,
    {
      theme: 'dark',
      granularity: 'monthly',
      title: 'react',
      unit: 'downloads',
      scale: 'log',
    },
  ],
]

for (const [name, input, opts] of jobs) {
  writeFileSync(`${out}/${name}.svg`, renderChart(input, opts))
}
console.log('rendered', jobs.length, 'charts')

// Screenshot with headless Chrome at the chart's own size, avoiding any scale
// or crop.
const { execFileSync } = await import('node:child_process')
/** Override on Linux/Windows, e.g. `CHROME=google-chrome pnpm render-svg`. */
const CHROME =
  process.env.CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for (const [name, , opts] of jobs) {
  const w = opts.width ?? 820
  const h = opts.height ?? 380
  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--screenshot=${out}/${name}.png`,
      `--window-size=${w},${h}`,
      `file://${out}/${name}.svg`,
    ],
    { stdio: 'ignore' }
  )
}
console.log('screenshotted')
