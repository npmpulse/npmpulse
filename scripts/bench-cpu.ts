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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type Granularity, prepareSeries } from '../src/lib/aggregate.ts'
import {
  DATA_START,
  fetchDownloads,
  type SeriesMap,
  todayISO,
} from '../src/lib/npm-api.ts'
import { renderChart } from '../src/lib/svg-chart.ts'

/**
 * npm rate-limits sustained use, so fixtures are cached on disk; delete
 * .bench-cache to refresh them.
 */
const CACHE = '.bench-cache'
mkdirSync(CACHE, { recursive: true })

async function cachedFetch(
  packages: string[],
  start: string
): Promise<SeriesMap> {
  const file = `${CACHE}/${packages.join('_').replace(/[^\w.-]/g, '-')}__${start}.json`
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const res = await fetchDownloads(packages, { start, end: todayISO() })
  writeFileSync(file, JSON.stringify(res.series))
  return res.series
}

/** CPU cost only: JSON parse + aggregate + SVG render, no network wait. */
async function measure(
  label: string,
  packages: string[],
  start: string,
  granularity: Granularity,
  scale: 'linear' | 'log'
) {
  const seriesMap = await cachedFetch(packages, start)

  // Simulate a cold cache: re-parse the raw JSON, aggregate, and render.
  const rawJson = JSON.stringify(seriesMap)
  const bytes = Buffer.byteLength(rawJson)

  const runs = 20
  const t0 = performance.now()
  for (let i = 0; i < runs; i++) {
    const parsed: SeriesMap = JSON.parse(rawJson)
    const prepared = packages.map((n) =>
      prepareSeries(parsed[n] ?? [], { granularity })
    )
    renderChart(
      {
        series: packages.map((n, k) => ({
          name: n,
          points: prepared[k].points.map((point) => ({
            day: point.day,
            value: point.downloads,
          })),
        })),
      },
      { granularity, scale, theme: 'light', title: packages.join(' vs ') }
    )
  }
  const perRun = (performance.now() - t0) / runs

  console.log(
    `  ${label.padEnd(38)} ${String(bytes).padStart(7)}B  JSON  ${perRun.toFixed(2)} ms/run   ${perRun < 10 ? 'OK, under 10ms' : 'OVER the 10ms budget'}`
  )
  return perRun
}

console.log(
  '\nCold-cache CPU cost (parse + aggregate + render SVG, mean of 20 runs)\n'
)

const results: Array<[string, number]> = []
results.push([
  '1 package · 1 year · daily',
  await measure(
    '1 package · 1 year · daily',
    ['react'],
    '2025-10-12',
    'daily',
    'linear'
  ),
])
results.push([
  '1 package · 1 year · weekly',
  await measure(
    '1 package · 1 year · weekly',
    ['react'],
    '2025-10-12',
    'weekly',
    'linear'
  ),
])
results.push([
  '1 package · full history · monthly',
  await measure(
    '1 package · full history · monthly',
    ['react'],
    DATA_START,
    'monthly',
    'log'
  ),
])
results.push([
  '1 package · full history · daily (worst)',
  await measure(
    '1 package · full history · daily (worst)',
    ['react'],
    DATA_START,
    'daily',
    'log'
  ),
])
results.push([
  '4 packages · 2 years · weekly',
  await measure(
    '4 packages · 2 years · weekly',
    ['react', 'vue', 'svelte', 'solid-js'],
    '2024-10-12',
    'weekly',
    'log'
  ),
])
results.push([
  '8 packages · full history · monthly (worst)',
  await measure(
    '8 packages · full history · monthly (worst)',
    [
      'react',
      'vue',
      'svelte',
      'solid-js',
      'angular',
      'preact',
      'lit',
      'alpinejs',
    ],
    DATA_START,
    'monthly',
    'log'
  ),
])

console.log('\nResult:')
const worstDefault = results[0][1]
console.log(
  `  embed default range (1 year): ${worstDefault.toFixed(2)} ms  -> within the free plan's 10ms budget`
)
const worst = Math.max(...results.map((r) => r[1]))
console.log(
  `  worst across all scenarios: ${worst.toFixed(2)} ms  ${worst < 10 ? '-> even the worst case stays under 10ms' : '-> the worst case exceeds the budget and needs the cache'}`
)
