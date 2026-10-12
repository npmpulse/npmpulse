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
import { matchOrThrow, must } from '../testing/must.ts'
import {
  addDays,
  BULK_CHUNK_DAYS,
  buildChunks,
  chunkDaysFor,
  clampStart,
  DATA_START,
  dayDiff,
  fetchDownloads,
  isValidDay,
  MAX_PACKAGES,
  missingPackages,
  NpmApiError,
  normalizePackages,
  parseDay,
  planRequests,
  SINGLE_CHUNK_DAYS,
  toDay,
  todayISO,
} from './npm-api.ts'

/* -------------------------------------------------------------- helpers */

const respond = (body: unknown, status = 200): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  })

/** Every day from start to end inclusive. */
function enumerate(start: string, end: string): string[] {
  const out: string[] = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1))
    out.push(cursor)
  return out
}

interface FakeOptions {
  /** Shift returned days later, to simulate the API shortening a range. */
  truncateBy?: number
  /** Prepend days before the requested start, to simulate overlapping chunks. */
  overlapBy?: number
}

/**
 * A stand-in npm downloads API that honours the two response shapes and records
 * every URL it was asked for, so chunking and encoding can be asserted on.
 */
function fakeApi(options: FakeOptions = {}) {
  const urls: string[] = []
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input)
    urls.push(url)

    const match =
      /\/range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(url)
    if (!match) return respond({ error: 'malformed' }, 400)

    const [, start, end, encodedNames] = match
    const names = encodedNames.split(',').map(decodeURIComponent)

    const first = options.truncateBy
      ? addDays(start, options.truncateBy)
      : addDays(start, -(options.overlapBy ?? 0))
    const days = enumerate(first, end).map((day) => ({ day, downloads: 1 }))

    if (names.length === 1)
      return respond({ package: names[0], start, end, downloads: days })
    return respond(
      Object.fromEntries(names.map((name) => [name, { downloads: days }]))
    )
  }) as unknown as typeof fetch

  return { fetchImpl, urls }
}

/* ------------------------------------------------------------ pure bits */

describe('date helpers', () => {
  it('parses and formats in UTC, so a local timezone cannot shift a day', () => {
    expect(toDay(parseDay('2026-03-04'))).toBe('2026-03-04')
    expect(parseDay('2026-03-04').toISOString()).toBe(
      '2026-03-04T00:00:00.000Z'
    )
  })

  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
  })

  it('measures whole days between dates, signed', () => {
    expect(dayDiff('2026-01-01', '2026-01-31')).toBe(30)
    expect(dayDiff('2026-01-31', '2026-01-01')).toBe(-30)
    expect(dayDiff('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('recognises a well-formed day and rejects everything else', () => {
    expect(isValidDay('2026-03-04')).toBe(true)
    expect(isValidDay('2026-3-4')).toBe(false)
    expect(isValidDay('2026-13-04')).toBe(false)
    expect(isValidDay('2026-02-30')).toBe(false)
    expect(isValidDay('2025-02-29')).toBe(false)
    expect(isValidDay('2024-02-29')).toBe(true)
    expect(isValidDay('not-a-date')).toBe(false)
    expect(isValidDay('')).toBe(false)
  })

  it('reports today as a UTC day', () => {
    expect(todayISO(new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-12')
  })

  it('never asks for data before npm has any', () => {
    expect(clampStart('2001-01-01')).toBe(DATA_START)
    expect(clampStart('2026-01-01')).toBe('2026-01-01')
  })
})

describe('normalizePackages', () => {
  it('splits on commas and whitespace, since neither can appear in a name', () => {
    expect(normalizePackages(['react,vue'])).toEqual(['react', 'vue'])
    expect(normalizePackages(['react vue'])).toEqual(['react', 'vue'])
    expect(normalizePackages([' react , vue '])).toEqual(['react', 'vue'])
  })

  it('de-duplicates and drops blanks', () => {
    expect(normalizePackages(['react', 'react'])).toEqual(['react'])
    expect(normalizePackages(['', '  ', 'react'])).toEqual(['react'])
  })

  it('keeps scope prefixes intact', () => {
    expect(normalizePackages(['@babel/core,react'])).toEqual([
      '@babel/core',
      'react',
    ])
  })

  it('returns an empty list for nothing', () => {
    expect(normalizePackages([])).toEqual([])
  })
})

describe('buildChunks', () => {
  it('splits a window into consecutive chunks with no gap or overlap', () => {
    const chunks = buildChunks('2026-01-01', '2026-01-10', 4)
    expect(chunks).toEqual([
      { start: '2026-01-01', end: '2026-01-04' },
      { start: '2026-01-05', end: '2026-01-08' },
      { start: '2026-01-09', end: '2026-01-10' },
    ])
  })

  it('counts the chunk size inclusively', () => {
    const [first] = buildChunks('2026-01-01', '2026-12-31', 10)
    expect(dayDiff(first.start, first.end) + 1).toBe(10)
  })

  it('returns a single chunk when the window fits', () => {
    expect(buildChunks('2026-01-01', '2026-01-05', 30)).toEqual([
      { start: '2026-01-01', end: '2026-01-05' },
    ])
  })

  it('returns one same-day chunk when start equals end', () => {
    expect(buildChunks('2026-01-01', '2026-01-01', 30)).toEqual([
      { start: '2026-01-01', end: '2026-01-01' },
    ])
  })

  it('keeps full history inside 8 chunks at the single-package size', () => {
    expect(
      buildChunks(DATA_START, '2026-10-12', SINGLE_CHUNK_DAYS)
    ).toHaveLength(8)
  })

  it('needs the smaller bulk size across the same span', () => {
    expect(
      buildChunks(DATA_START, '2026-10-12', BULK_CHUNK_DAYS).length
    ).toBeGreaterThan(8)
  })
})

describe('chunkDaysFor', () => {
  it('uses the wider single-package window for one package', () => {
    expect(chunkDaysFor(1)).toBe(SINGLE_CHUNK_DAYS)
  })

  it('uses the bulk window past one package', () => {
    expect(chunkDaysFor(2)).toBe(BULK_CHUNK_DAYS)
    expect(chunkDaysFor(50)).toBe(BULK_CHUNK_DAYS)
  })
})

describe('planRequests', () => {
  it('gives one stream to a lone package', () => {
    expect(planRequests(['react'])).toEqual([
      { names: ['react'], chunkDays: SINGLE_CHUNK_DAYS },
    ])
  })

  it('lets unscoped packages share a bulk stream', () => {
    expect(planRequests(['react', 'vue'])).toEqual([
      { names: ['react', 'vue'], chunkDays: BULK_CHUNK_DAYS },
    ])
  })

  it('gives every scoped package its own stream, since bulk rejects them', () => {
    const jobs = planRequests(['@a/x', '@b/y', 'react'])
    expect(jobs).toHaveLength(3)
    expect(
      jobs
        .filter((j) => j.names.length === 1)
        .map((j) => j.names[0])
        .sort()
    ).toEqual(['@a/x', '@b/y', 'react'])
  })

  it('never puts a scoped name in a multi-name stream', () => {
    for (const jobs of [
      planRequests(['@a/x', 'react', 'vue']),
      planRequests(['@a/x', '@b/y']),
    ]) {
      expect(
        jobs.some(
          (j) => j.names.length > 1 && j.names.some((n) => n.startsWith('@'))
        )
      ).toBe(false)
    }
  })

  it('returns nothing to plan for an empty list', () => {
    expect(planRequests([])).toEqual([])
  })
})

/* -------------------------------------------------------- fetchDownloads */

describe('fetchDownloads input validation', () => {
  const call = (packages: string[], options = {}) =>
    fetchDownloads(packages, {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl: fakeApi().fetchImpl,
      retryBaseDelayMs: 0,
      ...options,
    })

  it('rejects an empty list', async () => {
    await expect(call([])).rejects.toMatchObject({ code: 'bad-request' })
  })

  it('rejects a list that is only blanks', async () => {
    await expect(call(['', '  '])).rejects.toMatchObject({
      code: 'bad-request',
    })
  })

  it('rejects more than the API allows in one query', async () => {
    const tooMany = Array.from({ length: MAX_PACKAGES + 1 }, (_, i) => `p${i}`)
    await expect(call(tooMany)).rejects.toMatchObject({ code: 'bad-request' })
    expect(MAX_PACKAGES).toBe(128)
  })

  it('rejects a start after the end', async () => {
    await expect(
      fetchDownloads(['react'], {
        start: '2026-05-01',
        end: '2026-01-01',
        fetchImpl: fakeApi().fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'bad-request' })
  })

  it('rejects a malformed day', async () => {
    await expect(
      fetchDownloads(['react'], {
        start: 'nonsense',
        end: '2026-01-01',
        fetchImpl: fakeApi().fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'bad-request' })
  })
})

describe('fetchDownloads URL building', () => {
  it('sends one request for a short single-package window', async () => {
    const { fetchImpl, urls } = fakeApi()
    const result = await fetchDownloads(['react'], {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl,
    })

    expect(result.requests).toBe(1)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe(
      'https://api.npmjs.org/downloads/range/2026-01-01:2026-01-05/react'
    )
  })

  it('keeps the comma a separator rather than escaping it', async () => {
    const { fetchImpl, urls } = fakeApi()
    await fetchDownloads(['react', 'vue'], {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl,
    })

    expect(urls[0]).toMatch(/\/react,vue$/)
    expect(urls[0]).not.toContain('%2C')
  })

  it('escapes a scope separator without touching the package separator', async () => {
    const { fetchImpl, urls } = fakeApi()
    await fetchDownloads(['@babel/core', 'react'], {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl,
    })

    const scoped = must(
      urls.find((u) => u.includes('babel')),
      'a request carrying the scoped package'
    )
    expect(scoped).toMatch(/%40babel%2Fcore$/)
  })

  it('sizes each request for the package count the API will actually read', async () => {
    // Regression: these disagreeing is what produced "returned 400" for one tag
    // holding "react,vue" -- the client sized chunks for a single package while
    // the API read two segments, so a 549-day window was judged a bulk query.
    //
    // The invariant has to be stated per request, not per package list: a scoped
    // name legitimately travels alone on its own stream.
    for (const input of [
      ['react'],
      ['react,vue'],
      ['react vue'],
      ['@babel/core,react'],
      ['a,b,c,d'],
    ]) {
      const { fetchImpl, urls } = fakeApi()
      await fetchDownloads(input, {
        start: DATA_START,
        end: '2026-10-12',
        retryBaseDelayMs: 0,
        fetchImpl,
      })

      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) {
        const match = matchOrThrow(
          url,
          /range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/
        )
        const segments = match[3].split(',').length
        const span = dayDiff(match[1], match[2]) + 1
        expect(span).toBeLessThanOrEqual(
          segments === 1 ? SINGLE_CHUNK_DAYS : BULK_CHUNK_DAYS
        )
      }
    }
  })

  it('chunks full history at the single-package width', async () => {
    const { fetchImpl, urls } = fakeApi()
    const result = await fetchDownloads(['react'], {
      start: DATA_START,
      end: '2026-10-12',
      fetchImpl,
    })

    expect(result.requests).toBe(8)
    for (const url of urls) {
      const [, start, end] = matchOrThrow(
        url,
        /range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\//
      )
      expect(dayDiff(start, end) + 1).toBeLessThanOrEqual(SINGLE_CHUNK_DAYS)
    }
  })

  it('chunks a comparison at the narrower bulk width', async () => {
    const { fetchImpl, urls } = fakeApi()
    await fetchDownloads(['react', 'vue'], {
      start: DATA_START,
      end: '2026-10-12',
      fetchImpl,
    })

    for (const url of urls) {
      const [, start, end] = matchOrThrow(
        url,
        /range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\//
      )
      expect(dayDiff(start, end) + 1).toBeLessThanOrEqual(BULK_CHUNK_DAYS)
    }
  })

  it('opens a second stream for a scoped package instead of failing', async () => {
    const { fetchImpl, urls } = fakeApi()
    const result = await fetchDownloads(['@babel/core', 'react'], {
      start: DATA_START,
      end: '2026-10-12',
      fetchImpl,
    })

    const scoped = urls.filter((u) => u.includes('babel'))
    const plain = urls.filter((u) => u.endsWith('/react'))
    expect(scoped).toHaveLength(8)
    expect(plain).toHaveLength(8)
    expect(result.requests).toBe(16)
    expect(Object.keys(result.series).sort()).toEqual(['@babel/core', 'react'])
  })

  it('normalises a separators-in-one-tag list before counting', async () => {
    const { fetchImpl, urls } = fakeApi()
    const result = await fetchDownloads(['react,vue,svelte'], {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl,
    })

    expect(result.requests).toBe(1)
    expect(Object.keys(result.series).sort()).toEqual([
      'react',
      'svelte',
      'vue',
    ])
    expect(urls[0]).toMatch(/\/react,vue,svelte$/)
  })
})

describe('fetchDownloads results', () => {
  it('merges chunks into one ascending series per package', async () => {
    const { fetchImpl } = fakeApi()
    const result = await fetchDownloads(['react'], {
      start: '2026-01-01',
      end: '2026-03-01',
      fetchImpl,
    })

    const days = result.series.react.map((p) => p.day)
    expect(days[0]).toBe('2026-01-01')
    expect(days.at(-1)).toBe('2026-03-01')
    expect(days).toEqual([...days].sort())
    expect(new Set(days).size).toBe(days.length)
  })

  it('de-duplicates days when a chunk overlaps its neighbour', async () => {
    const { fetchImpl } = fakeApi({ overlapBy: 3 })
    const result = await fetchDownloads(['react'], {
      start: '2026-01-01',
      end: '2026-03-01',
      fetchImpl,
    })

    const days = result.series.react.map((p) => p.day)
    expect(new Set(days).size).toBe(days.length)
  })

  it('returns every requested package, even one with no data', async () => {
    const fetchImpl = (async () =>
      respond({ react: { downloads: [] } })) as unknown as typeof fetch
    const result = await fetchDownloads(['react', 'vue'], {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl,
    })

    expect(Object.keys(result.series).sort()).toEqual(['react', 'vue'])
    expect(result.series.vue).toEqual([])
  })

  it('reports the resolved window', async () => {
    const { fetchImpl } = fakeApi()
    const result = await fetchDownloads(['react'], {
      start: '2026-01-01',
      end: '2026-01-05',
      fetchImpl,
    })
    expect(result.start).toBe('2026-01-01')
    expect(result.end).toBe('2026-01-05')
  })

  it('clamps a start before the first data day', async () => {
    const { fetchImpl } = fakeApi()
    const result = await fetchDownloads(['react'], {
      start: '2001-01-01',
      end: '2016-01-01',
      fetchImpl,
    })
    expect(result.start).toBe(DATA_START)
  })
})

describe('fetchDownloads error handling', () => {
  const failing = (status: number, body: unknown) =>
    (async () => respond(body, status)) as unknown as typeof fetch

  it('refuses a series the API silently shortened', async () => {
    // The API truncates an over-long range rather than rejecting it; stitching
    // that would draw a chart missing years with no sign anything went wrong.
    const { fetchImpl } = fakeApi({ truncateBy: 10 })
    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-30',
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'truncated' })
  })

  it('names the missing package on a 404', async () => {
    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: failing(404, { error: 'nope' }),
      })
    ).rejects.toMatchObject({ code: 'not-found' })

    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: failing(404, ''),
      })
    ).rejects.toThrow(/react/)
  })

  it('quotes every name when several were asked for', async () => {
    await expect(
      fetchDownloads(['react', 'vue'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: failing(404, ''),
      })
    ).rejects.toThrow(/"react"\s*,\s*"vue"/)
  })

  it('explains rate limiting rather than reporting a bare 429', async () => {
    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: failing(429, ''),
      })
    ).rejects.toThrow(/rate-limiting/)
  })

  it("surfaces the API's own explanation for a 400", async () => {
    const body = { error: 'exceeded max days of 365 for bulk query' }
    await expect(
      fetchDownloads(['react', 'vue'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: failing(400, body),
      })
    ).rejects.toThrow('exceeded max days of 365 for bulk query')
  })

  it('falls back to the status when the error body is not JSON', async () => {
    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: failing(500, '<html>oops</html>'),
      })
    ).rejects.toThrow(/returned 500/)
  })

  it('rejects an unexpected response shape', async () => {
    const weird = (async () => respond([1, 2, 3])) as unknown as typeof fetch
    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: weird,
      })
    ).rejects.toMatchObject({ code: 'http' })
  })

  it('wraps a transport failure as a network error', async () => {
    const boom = (async () => {
      throw new Error('socket hang up')
    }) as unknown as typeof fetch
    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: boom,
      })
    ).rejects.toMatchObject({ code: 'network' })
  })

  it('propagates an abort instead of retrying or wrapping it', async () => {
    const controller = new AbortController()
    const aborting = (async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    }) as unknown as typeof fetch

    await expect(
      fetchDownloads(['react'], {
        start: '2026-01-01',
        end: '2026-01-05',
        retryBaseDelayMs: 0,
        fetchImpl: aborting,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('retries a 429 and succeeds', async () => {
    let attempts = 0
    const flaky = (async (input: string | URL) => {
      attempts++
      if (attempts < 3) return respond({ error: 'slow down' }, 429)
      return fakeApi().fetchImpl(input as string)
    }) as unknown as typeof fetch

    const result = await fetchDownloads(['react'], {
      start: '2026-01-01',
      end: '2026-01-05',
      retryBaseDelayMs: 0,
      fetchImpl: flaky,
    })
    expect(attempts).toBe(3)
    expect(result.series.react.length).toBe(5)
  })
})

describe('missingPackages', () => {
  it('lists packages that came back empty', () => {
    expect(
      missingPackages({ react: [{ day: 'd', downloads: 1 }], vue: [] })
    ).toEqual(['vue'])
  })

  it('is empty when everything returned data', () => {
    expect(missingPackages({ react: [{ day: 'd', downloads: 1 }] })).toEqual([])
  })
})

describe('NpmApiError', () => {
  it('carries a code and an optional status', () => {
    const error = new NpmApiError('not-found', 'gone', 404)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('NpmApiError')
    expect(error.code).toBe('not-found')
    expect(error.status).toBe(404)
  })
})
