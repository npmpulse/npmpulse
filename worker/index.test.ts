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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '../src/lib/npm-api.ts'
import { DARK_THEME, LIGHT_THEME } from '../src/lib/theme.ts'
import { matchOrThrow } from '../src/testing/must.ts'
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  MAX_EMBED_PACKAGES,
  MAX_PACKAGE_DAYS,
} from './embed.ts'
import worker from './index.ts'

const TODAY = '2026-10-12'
const ORIGIN = 'https://npmpulse.com'
/* ---------------------------------------------------------------- handler */

interface Upstream {
  urls: string[]
  failWith?: { status: number; body: unknown; retryAfter?: string }
}

function stubUpstream(options: Upstream = { urls: [] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      options.urls.push(url)

      if (options.failWith) {
        return new Response(JSON.stringify(options.failWith.body), {
          status: options.failWith.status,
          headers: options.failWith.retryAfter
            ? { 'retry-after': options.failWith.retryAfter }
            : undefined,
        })
      }

      const match =
        /range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(url)
      if (!match) return new Response('{}', { status: 400 })

      const [, start, end, encoded] = match
      const names = encoded.split(',').map(decodeURIComponent)
      const days: Array<{ day: string; downloads: number }> = []
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        days.push({ day: cursor, downloads: 100 + days.length })
      }

      const body =
        names.length === 1
          ? { package: names[0], start, end, downloads: days }
          : Object.fromEntries(names.map((n) => [n, { downloads: days }]))
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

function stubCaches() {
  const store = new Map<string, Response>()
  const stub = {
    default: {
      match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        store.set(request.url, response)
      }),
    },
  }
  vi.stubGlobal('caches', stub)
  return { store, stub }
}

function makeEnv() {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response('asset', { status: 200 })),
    },
  }
}

function makeCtx() {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() }
}

const call = (query: string, init?: RequestInit) =>
  worker.fetch(
    new Request(`${ORIGIN}/api/svg${query}`, init),
    makeEnv(),
    makeCtx() as unknown as ExecutionContext
  )

let upstream: Upstream
let cacheStore: Map<string, Response>
let cacheStub: ReturnType<typeof stubCaches>['stub']

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  upstream = { urls: [] }
  stubUpstream(upstream)
  const stubbed = stubCaches()
  cacheStore = stubbed.store
  cacheStub = stubbed.stub
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('module shape', () => {
  it('exports nothing but its default handler', async () => {
    // workerd treats every named export of the entry module as a candidate
    // handler, and refuses to start the Worker if one is not callable:
    //   Incorrect type for map entry 'DEFAULT_HEIGHT': the provided value is
    //   not of type 'function or ExportedHandler'
    // So a helper exported here for convenience takes the whole endpoint down,
    // and nothing short of booting the Worker reveals it.
    const module = await import('../worker/index.ts')
    expect(Object.keys(module).filter((key) => key !== 'default')).toEqual([])
  })

  it('keeps the testable helpers in their own module', async () => {
    const embed = await import('../worker/embed.ts')
    for (const name of ['clamp', 'svgResponse', 'errorSvg']) {
      expect(typeof embed[name as keyof typeof embed]).toBe('function')
    }
    // The range and granularity vocabulary is not Worker-side any more: it
    // lives in `src/lib`, which is what lets both endpoints read one URL the
    // same way.
    const range = await import('../src/lib/range.ts')
    for (const name of ['parseRange', 'resolveGranularity']) {
      expect(typeof range[name as keyof typeof range]).toBe('function')
    }
  })
})

describe('routing', () => {
  it('hands anything outside /api/ to the static assets', async () => {
    const env = makeEnv()
    const response = await worker.fetch(
      new Request(`${ORIGIN}/react`),
      env,
      makeCtx() as unknown as ExecutionContext
    )

    expect(env.ASSETS.fetch).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('asset')
  })

  it('404s an unknown /api/ route', async () => {
    const response = await call('/wrong')
    expect(response.status).toBe(404)
  })

  it('rejects a write method, advertising what it accepts', async () => {
    const response = await call('?q=react', { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  it('answers HEAD', async () => {
    const response = await call('?q=react', { method: 'HEAD' })
    expect(response.status).toBe(200)
  })
})

describe('caching', () => {
  it('serves a repeated request from the cache without touching npm', async () => {
    await call('?q=react&range=1y')
    const upstreamCalls = upstream.urls.length

    const second = await call('?q=react&range=1y')
    expect(second.status).toBe(200)
    expect(upstream.urls).toHaveLength(upstreamCalls)
    expect(cacheStub.default.put).toHaveBeenCalled()
  })

  it('keys the cache on the full query, so a different chart is a different entry', async () => {
    await call('?q=react&range=1y')
    const before = upstream.urls.length

    await call('?q=react&range=5y')
    expect(upstream.urls.length).toBeGreaterThan(before)
    expect(cacheStore.size).toBe(2)
  })

  it('stores the render for the edge, with an immutable long cache', async () => {
    const response = await call('?q=react')
    expect(response.headers.get('content-type')).toBe(
      'image/svg+xml; charset=utf-8'
    )
    expect(response.headers.get('cache-control')).toContain('max-age=3600')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('validation', () => {
  it('asks for a package when none was given', async () => {
    const response = await call('')
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Add ?q=')
  })

  it('ignores blank package entries', async () => {
    const response = await call('?q=,,,')
    expect(response.status).toBe(400)
  })

  it('ignores the spellings it used to accept', async () => {
    // One way to say each thing. A URL still carrying an old name gets the
    // error naming the right one, rather than a chart of nothing.
    const response = await call('?packages=react')
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Add ?q=')
  })

  it('reads the granularity under its one name only', async () => {
    // `g` was an accepted alias until it was not. A year-long range derives a
    // weekly axis, so an identical render is what shows the old name did
    // nothing at all.
    expect(await (await call('?q=react&range=1y&g=yearly')).text()).toBe(
      await (await call('?q=react&range=1y')).text()
    )
  })

  it('reads a plain day count, which the site now also understands', async () => {
    expect(await (await call('?q=react&range=90d')).text()).toBe(
      await (await call('?q=react&range=3m')).text()
    )
  })

  it('treats an unreadable range as no range, not as the full history', async () => {
    // A typo in a README must not quietly turn a badge into the expensive
    // full-history render.
    const bare = await (await call('?q=react')).text()
    const typo = await (await call('?q=react&range=5yy')).text()
    const everything = await (await call('?q=react&range=all')).text()
    expect(typo).toBe(bare)
    expect(typo).not.toBe(everything)
  })

  it(`refuses more than ${MAX_EMBED_PACKAGES} packages`, async () => {
    const names = Array.from(
      { length: MAX_EMBED_PACKAGES + 1 },
      (_, i) => `p${i}`
    ).join(',')
    const response = await call(`?q=${names}`)

    expect(response.status).toBe(400)
    expect(await response.text()).toContain(`At most ${MAX_EMBED_PACKAGES}`)
  })

  it('refuses a request whose payload would blow the CPU budget', async () => {
    // Eight packages across the full history parses about 1.3MB, well over the
    // 10ms a free-plan Worker gets, so it is declined with an actionable reason
    // rather than left to fail as an opaque 500.
    const names = Array.from({ length: 8 }, (_, i) => `p${i}`).join(',')
    const response = await call(`?q=${names}&range=all`)
    const body = await response.text()

    expect(response.status).toBe(400)
    expect(body).toContain('exceeds the embed budget')
    expect(MAX_PACKAGE_DAYS).toBe(12_000)
  })

  it('allows a single package across the full history', async () => {
    const response = await call('?q=react&range=all')
    expect(response.status).toBe(200)
  })

  it('returns an image even for an error, so a README shows the reason', async () => {
    const response = await call('')
    expect(response.headers.get('content-type')).toBe(
      'image/svg+xml; charset=utf-8'
    )
  })

  it('escapes the message it embeds in the error image', async () => {
    const response = await call(`?q=${'<script>'.repeat(1)}%3Cimg%3E`)
    const body = await response.text()
    expect(body).not.toContain('<img>')
  })
})

describe('rendering', () => {
  it('produces an svg for a valid request', async () => {
    const body = await (await call('?q=react')).text()
    expect(body.startsWith('<svg')).toBe(true)
    expect(body).toContain('downloads')
  })

  it('names the package in the image, since a lone series draws no legend', async () => {
    // Without this the README image would be an anonymous line.
    expect(await (await call('?q=react')).text()).toContain('react')
    expect(await (await call('?q=react,vue')).text()).toContain('react vs vue')
  })

  it('lets an explicit title override the package names', async () => {
    const body = await (await call('?q=react&title=My%20chart')).text()
    expect(body).toContain('My chart')
    expect(body).not.toContain('react vs')
  })

  it('uses the light theme by default and dark on request', async () => {
    const light = await (await call('?q=react')).text()
    expect(light).toContain(LIGHT_THEME.surface)

    const dark = await (await call('?q=react&theme=dark')).text()
    expect(dark).toContain(DARK_THEME.surface)
  })

  it('switches to a log axis on request', async () => {
    const linear = await (await call('?q=react')).text()
    const log = await (await call('?q=react&scale=log')).text()
    expect(log).not.toBe(linear)
    expect(log).toContain('log scale')
  })

  it('honours an explicit granularity', async () => {
    // The granularity shows up in the x-axis labels, not as a word.
    const xLabels = (body: string) =>
      [...body.matchAll(/text-anchor="middle"[^>]*>([^<]+)</g)].map((m) => m[1])

    const yearly = xLabels(
      await (await call('?q=react&range=all&granularity=yearly')).text()
    )
    expect(yearly.every((label) => /^\d{4}$/.test(label))).toBe(true)

    const monthly = xLabels(
      await (await call('?q=react&range=all&granularity=monthly')).text()
    )
    expect(
      monthly.some((label) => /^[A-Z][a-z]{2} &apos;\d\d$/.test(label))
    ).toBe(true)
  })

  it('ignores an unrecognised granularity and derives one instead', async () => {
    const labels = (body: string) =>
      [...body.matchAll(/text-anchor="middle"[^>]*>([^<]+)</g)].map((m) => m[1])
    const bogus = labels(
      await (await call('?q=react&range=all&granularity=fortnightly')).text()
    )
    expect(bogus.every((label) => /^\d{4}$/.test(label))).toBe(true) // long range -> yearly
  })

  it('passes a title and unit through', async () => {
    const body = await (await call('?q=react&title=Hello&unit=installs')).text()
    expect(body).toContain('Hello')
    expect(body).toContain('installs')
  })

  it('defaults the unit to downloads', async () => {
    expect(await (await call('?q=react')).text()).toContain('downloads')
  })

  it('draws every package in a comparison', async () => {
    const body = await (await call('?q=react,vue')).text()
    expect(body).toContain('react')
    expect(body).toContain('vue')
  })
})

describe('size parameters', () => {
  const dims = async (query: string) => {
    const body = await (await call(query)).text()
    return matchOrThrow(body, /viewBox="0 0 (\d+) (\d+)"/)
      .slice(1)
      .map(Number)
  }

  it('uses the defaults when none are given', async () => {
    expect(await dims('?q=react')).toEqual([DEFAULT_WIDTH, DEFAULT_HEIGHT])
  })

  it('honours explicit dimensions', async () => {
    expect(await dims('?q=react&width=600&height=300')).toEqual([600, 300])
  })

  it('clamps absurd dimensions instead of drawing them', async () => {
    expect(await dims('?q=react&width=1&height=1')).toEqual([240, 140])
    expect(await dims('?q=react&width=99999&height=99999')).toEqual([1600, 900])
  })

  it('falls back to the default for a non-numeric value', async () => {
    expect(await dims('?q=react&width=abc&height=0')).toEqual([
      DEFAULT_WIDTH,
      DEFAULT_HEIGHT,
    ])
  })
})

describe('upstream failures', () => {
  it('renders the API message into the image', async () => {
    upstream.failWith = {
      status: 404,
      body: { error: 'package react not found' },
    }

    const response = await call('?q=react')
    const body = await response.text()

    expect(response.status).toBe(400)
    expect(body).toContain('Package not found')
  })

  it('reports rate limiting rather than a bare status', async () => {
    // retry-after: 0 keeps the retry backoff at zero; the default would spend
    // about eight seconds before the last attempt.
    upstream.failWith = {
      status: 429,
      body: { error: 'slow down' },
      retryAfter: '0',
    }

    const body = await (await call('?q=react')).text()
    expect(body).toContain('rate-limiting')
  })

  it('keeps an empty package in the chart rather than erroring', async () => {
    // A package with no downloads in the window is an answer, not a failure.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              react: { downloads: [] },
              vue: { downloads: [] },
            }),
            { status: 200 }
          )
      )
    )

    const response = await call('?q=react,vue')
    expect(response.status).toBe(200)
  })
})
