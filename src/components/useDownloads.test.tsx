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

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheKey, writeCachedSeries } from '../lib/cache.ts'
import { addDays } from '../lib/npm-api.ts'
import { matchOrThrow } from '../testing/must.ts'
import { useDownloads } from './useDownloads.ts'

const START = '2026-01-01'
const END = '2026-01-05'

function stubUpstream() {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      urls.push(url)
      const [, start, end, tail] = matchOrThrow(
        url,
        /range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/
      )
      const names = tail.split(',').map(decodeURIComponent)
      const days: Array<{ day: string; downloads: number }> = []
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        days.push({ day: cursor, downloads: 42 })
      }
      const body =
        names.length === 1
          ? { package: names[0], start, end, downloads: days }
          : Object.fromEntries(names.map((n) => [n, { downloads: days }]))
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
  return urls
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('useDownloads', () => {
  it('stays idle with no packages', () => {
    stubUpstream()
    const { result } = renderHook(() =>
      useDownloads({ packages: [], start: START, end: END })
    )

    expect(result.current.loading).toBe(false)
    expect(result.current.points).toEqual({})
    expect(result.current.error).toBeNull()
  })

  it('fetches and reports the series', async () => {
    const urls = stubUpstream()
    const { result } = renderHook(() =>
      useDownloads({ packages: ['react'], start: START, end: END })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.points.react).toHaveLength(5)
    expect(result.current.points.react[0]).toEqual({
      day: START,
      downloads: 42,
    })
    expect(result.current.requests).toBe(1)
    expect(result.current.fromCache).toBe(false)
    expect(urls).toHaveLength(1)
  })

  it('requests every package in one call', async () => {
    const urls = stubUpstream()
    const { result } = renderHook(() =>
      useDownloads({ packages: ['react', 'vue'], start: START, end: END })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(urls).toHaveLength(1)
    expect(Object.keys(result.current.points).sort()).toEqual(['react', 'vue'])
  })

  it('serves a second mount from the cache without re-fetching', async () => {
    const urls = stubUpstream()
    const first = renderHook(() =>
      useDownloads({ packages: ['react'], start: START, end: END })
    )
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    const second = renderHook(() =>
      useDownloads({ packages: ['react'], start: START, end: END })
    )
    await waitFor(() =>
      expect(second.result.current.points.react).toHaveLength(5)
    )

    expect(second.result.current.fromCache).toBe(true)
    expect(second.result.current.requests).toBe(0)
    expect(urls).toHaveLength(1)
  })

  it('re-fetches after a reload is requested, past the cache', async () => {
    const urls = stubUpstream()
    const { result, rerender } = renderHook(
      ({ token }) =>
        useDownloads({
          packages: ['react'],
          start: START,
          end: END,
          reloadToken: token,
        }),
      { initialProps: { token: 0 } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(urls).toHaveLength(1)

    rerender({ token: 1 })
    await waitFor(() => expect(result.current.fromCache).toBe(false))
    expect(urls).toHaveLength(2)
  })

  it('uses the cache again on a later change rather than re-fetching forever', async () => {
    // A refresh should bypass the cache once, not permanently.
    const urls = stubUpstream()
    const { result, rerender } = renderHook(
      ({ range }) =>
        useDownloads({
          packages: ['react'],
          start: range,
          end: END,
          reloadToken: 1,
        }),
      { initialProps: { range: START } }
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(urls).toHaveLength(1)

    // Same token, different window: nothing is cached for it, so one fetch.
    rerender({ range: addDays(START, -1) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(urls).toHaveLength(2)

    // Back to the first window, which is now cached.
    rerender({ range: START })
    await waitFor(() => expect(result.current.fromCache).toBe(true))
    expect(urls).toHaveLength(2)
  })

  it('surfaces a fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'nope' }), { status: 404 })
      )
    )
    const { result } = renderHook(() =>
      useDownloads({ packages: ['ghost'], start: START, end: END })
    )

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toMatch(/Package not found/)
    expect(result.current.points).toEqual({})
  })

  it('reports a multi-package request count for a long window', async () => {
    stubUpstream()
    const { result } = renderHook(() =>
      useDownloads({
        packages: ['react', 'vue'],
        start: '2015-02-27',
        end: '2026-10-12',
      })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    // Bulk chunks are 365 days, so full history needs more than the 8 a single
    // package would.
    expect(result.current.requests).toBeGreaterThan(8)
  })

  it('ignores a stale response when the packages change mid-flight', async () => {
    let resolveFirst: ((r: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) => {
        const url = String(input)
        if (url.includes('slowpkg')) {
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve
          })
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              react: { downloads: [{ day: START, downloads: 1 }] },
            }),
            { status: 200 }
          )
        )
      })
    )

    const { result, rerender } = renderHook(
      ({ packages }) => useDownloads({ packages, start: START, end: END }),
      { initialProps: { packages: ['slowpkg'] } }
    )

    rerender({ packages: ['react'] })
    await waitFor(() => expect(result.current.points.react).toHaveLength(1))

    // The first request resolves late; its result must not overwrite the second.
    resolveFirst?.(
      new Response(
        JSON.stringify({
          package: 'slowpkg',
          start: START,
          end: END,
          downloads: [],
        }),
        { status: 200 }
      )
    )
    await waitFor(() => expect(result.current.points.slowpkg).toBeUndefined())
    expect(result.current.points.react).toBeDefined()
  })

  it('reads a cache entry written for the same window', async () => {
    stubUpstream()
    const key = cacheKey(['react'], START, END)
    writeCachedSeries(`${key}|react`, [
      { day: START, downloads: 7 },
      { day: addDays(START, 1), downloads: 7 },
    ])

    const { result } = renderHook(() =>
      useDownloads({ packages: ['react'], start: START, end: END })
    )
    await waitFor(() => expect(result.current.fromCache).toBe(true))
    expect(result.current.points.react[0].downloads).toBe(7)
  })
})
