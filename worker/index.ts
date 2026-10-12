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
 * Cloudflare Worker: the embed endpoint, plus static-asset fallback.
 *
 * `wrangler.jsonc` sets `run_worker_first: ["/api/*"]`, so every other request
 * is served straight from the static build by Cloudflare and never wakes this
 * script -- static page views are free and unmetered, and only embeds consume
 * the Workers request quota.
 *
 * The response is cached in the Cache API. That matters for more than speed:
 * on the free plan a Worker gets 10ms of CPU per request, and rendering a
 * multi-year chart means parsing a few hundred KB of JSON. A cache hit skips
 * all of that.
 *
 * This module exports its default handler and NOTHING else. workerd treats
 * every named export of the entry module as a candidate handler, so a stray
 * `export const DEFAULT_HEIGHT = 380` makes it refuse to start the Worker
 * outright. The parameters and response helpers the tests need live in
 * `worker/embed.ts` for that reason.
 */

import { prepareSeries } from '../src/lib/aggregate.ts'
import { fetchDownloads, type SeriesMap, todayISO } from '../src/lib/npm-api.ts'
import { GRANULARITY_PARAM, PACKAGE_PARAM } from '../src/lib/params.ts'
import {
  parseRange,
  presetToRange,
  resolveGranularity,
} from '../src/lib/range.ts'
import { renderChart, type ScaleKind } from '../src/lib/svg-chart.ts'
import type { ThemeMode } from '../src/lib/theme.ts'
import {
  clamp,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  errorSvg,
  MAX_EMBED_PACKAGES,
  MAX_PACKAGE_DAYS,
  svgResponse,
} from './embed.ts'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    if (url.pathname !== '/api/svg') {
      return new Response('Not found', { status: 404 })
    }

    const params = url.searchParams
    const theme: ThemeMode = params.get('theme') === 'dark' ? 'dark' : 'light'
    const scale: ScaleKind = params.get('scale') === 'log' ? 'log' : 'linear'

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      })
    }

    // Cache key deliberately excludes nothing: identical query strings share a
    // cached render, which is exactly what the embed traffic looks like.
    const cacheKey = new Request(url.toString(), { method: 'GET' })
    const cached = await caches.default.match(cacheKey)
    if (cached) return cached

    const packages = (params.get(PACKAGE_PARAM) ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    if (packages.length === 0) {
      return errorSvg(
        `Add ?${PACKAGE_PARAM}=your-package to render a chart`,
        theme
      )
    }
    if (packages.length > MAX_EMBED_PACKAGES) {
      return errorSvg(`At most ${MAX_EMBED_PACKAGES} packages per embed`, theme)
    }

    const width = clamp(Number(params.get('width')) || DEFAULT_WIDTH, 240, 1600)
    const height = clamp(
      Number(params.get('height')) || DEFAULT_HEIGHT,
      140,
      900
    )

    const today = todayISO()
    // One year is this endpoint's default both when `range` is absent and when
    // it is unreadable, so a typo in a README cannot quietly turn a badge into a
    // full-history chart -- the expensive render, and not what was asked for.
    const { start, end } =
      parseRange(params.get('range'), today) ?? presetToRange('1y', today)
    const granularity = resolveGranularity(
      params.get(GRANULARITY_PARAM),
      start,
      end
    )

    const days =
      Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
          86_400_000
      ) + 1
    if (packages.length * days > MAX_PACKAGE_DAYS) {
      return errorSvg(
        'Too much data for one image — narrow the range or drop to fewer packages ' +
          `(${packages.length} packages x ${days} days exceeds the embed budget)`,
        theme
      )
    }

    let series: SeriesMap
    try {
      const result = await fetchDownloads(packages, { start, end })
      series = result.series
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not load download data'
      return errorSvg(message, theme)
    }

    const prepared = packages.map((name) =>
      prepareSeries(series[name] ?? [], { granularity })
    )

    // Each series is handed its own days. They do not all start together -- the
    // head of each is trimmed to where that package's records begin -- and
    // lining them up by array position would draw a newer package's first day
    // at the chart's start.
    //
    // A package that reported nothing in the window is a real answer, not an
    // error: keep it in the legend and let its line stay empty.
    const chart = renderChart(
      {
        series: packages.map((name, index) => ({
          name,
          points: prepared[index].points.map((point) => ({
            day: point.day,
            value: point.downloads,
          })),
        })),
      },
      {
        width,
        height,
        theme,
        granularity,
        scale,
        // Default the title to the packages themselves. A single-series chart
        // draws no legend, so without this the image embedded in a README would
        // be an anonymous line with no indication of what it plots.
        title: params.get('title') ?? packages.join(' vs '),
        unit: params.get('unit') ?? 'downloads',
      }
    )

    const response = svgResponse(chart, 3600)
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
    return response
  },
}
