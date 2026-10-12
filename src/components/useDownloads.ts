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

import { useEffect, useMemo, useRef, useState } from 'react'
import { cacheKey, readCachedSeries, writeCachedSeries } from '../lib/cache.ts'
import { type DayPoint, fetchDownloads, NpmApiError } from '../lib/npm-api.ts'

export interface DownloadsState {
  points: Record<string, DayPoint[]>
  /** Upstream requests made; surfaced so the chunking is verifiable in the UI. */
  requests: number | null
  loading: boolean
  error: string | null
  fromCache: boolean
}

interface Options {
  packages: string[]
  start: string
  end: string
  /** Bump to bypass the client cache and re-fetch. */
  reloadToken?: number
}

/**
 * Fetch daily downloads for the selected packages and window.
 *
 * Stale responses are discarded via AbortController: typing a new package name
 * fires a new request while the previous one is in flight, and without this the
 * slower of the two could land last and paint the wrong chart.
 */
export function useDownloads({
  packages,
  start,
  end,
  reloadToken = 0,
}: Options): DownloadsState {
  const [state, setState] = useState<DownloadsState>({
    points: {},
    requests: null,
    loading: false,
    error: null,
    fromCache: false,
  })

  const key = useMemo(
    () => (packages.length > 0 ? cacheKey(packages, start, end) : ''),
    [packages, start, end]
  )

  // A refresh should bypass the cache for the render it was requested on, not
  // for every render afterwards -- otherwise changing the range later would
  // silently re-fetch what is already cached.
  const appliedToken = useRef(reloadToken)

  // The effect keys off `key`, which is derived from the package list, rather
  // than off the `packages` array itself. Depending on the array meant any
  // caller passing an inline literal -- `useDownloads({ packages: ['react'] })`
  // -- got a fresh reference every render, so the effect re-ran, set state,
  // re-rendered, and looped until the tab died. `key` changes exactly when the
  // set of packages does, which is the behaviour we actually want.
  const latestPackages = useRef(packages)
  latestPackages.current = packages

  useEffect(() => {
    const names = latestPackages.current
    if (names.length === 0 || !key) {
      setState({
        points: {},
        requests: null,
        loading: false,
        error: null,
        fromCache: false,
      })
      return
    }

    const force = reloadToken !== appliedToken.current
    appliedToken.current = reloadToken

    const cached: Record<string, DayPoint[]> = {}
    let allCached = true
    for (const name of names) {
      const hit = force ? null : readCachedSeries(`${key}|${name}`)
      if (hit) cached[name] = hit
      else allCached = false
    }

    if (allCached) {
      setState({
        points: cached,
        requests: 0,
        loading: false,
        error: null,
        fromCache: true,
      })
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setState((previous) => ({ ...previous, loading: true, error: null }))

    fetchDownloads(names, { start, end, signal: controller.signal })
      .then((result) => {
        if (cancelled) return
        for (const [name, points] of Object.entries(result.series)) {
          writeCachedSeries(`${key}|${name}`, points)
        }
        setState({
          points: result.series,
          requests: result.requests,
          loading: false,
          error: null,
          fromCache: false,
        })
      })
      .catch((error: unknown) => {
        if (
          cancelled ||
          (error instanceof Error && error.name === 'AbortError')
        )
          return
        const message =
          error instanceof NpmApiError && error.code === 'not-found'
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Could not load download data.'
        setState({
          points: {},
          requests: null,
          loading: false,
          error: message,
          fromCache: false,
        })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [key, start, end, reloadToken])

  return state
}
