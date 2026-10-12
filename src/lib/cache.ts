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
 * Browser-side cache for fetched series.
 *
 * Full-history requests cost eight upstream calls and a few hundred KB, so a
 * reload should not repeat them. Entries are stored in the compact
 * `{start, values[]}` form rather than as `{day, downloads}[]` objects: the
 * API returns contiguous days, so a day is `start + index` and the JSON is
 * roughly a quarter the size. A non-contiguous series simply is not cached.
 *
 * Every access is guarded: localStorage throws in private windows and when
 * site data is blocked, and none of that should break the page.
 */

import { addDays, type DayPoint } from './npm-api.ts'

const CACHE_VERSION = 'v1'
const TTL_MS = 6 * 60 * 60 * 1000
/** Above this, skip caching rather than fill the origin's quota. */
const MAX_ENTRY_BYTES = 1_500_000

interface CacheEntry {
  savedAt: number
  start: string
  values: number[]
}

export function cacheKey(
  packages: readonly string[],
  start: string,
  end: string
): string {
  return `${CACHE_VERSION}|${[...packages].sort().join(',')}|${start}|${end}`
}

function storage(): Storage | null {
  try {
    const probe = '__npmpulse_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function readCachedSeries(key: string): DayPoint[] | null {
  const store = storage()
  if (!store) return null

  try {
    const raw = store.getItem(key)
    if (!raw) return null

    let entry: CacheEntry
    try {
      entry = JSON.parse(raw) as CacheEntry
    } catch {
      // Unparseable entries can never become useful again, so drop them rather
      // than re-parse the same garbage on every load and hold the quota. This
      // also matches what pruneExpired already does for them.
      store.removeItem(key)
      return null
    }

    if (
      !entry ||
      typeof entry.savedAt !== 'number' ||
      !Array.isArray(entry.values)
    ) {
      store.removeItem(key)
      return null
    }
    if (Date.now() - entry.savedAt > TTL_MS) {
      store.removeItem(key)
      return null
    }

    return entry.values.map((downloads, index) => ({
      day: addDays(entry.start, index),
      downloads,
    }))
  } catch {
    return null
  }
}

export function writeCachedSeries(
  key: string,
  points: readonly DayPoint[]
): void {
  const store = storage()
  if (!store || points.length === 0) return

  try {
    // Only the contiguous shape the reconstruction assumes.
    for (let i = 1; i < points.length; i++) {
      if (addDays(points[i - 1].day, 1) !== points[i].day) return
    }

    const entry: CacheEntry = {
      savedAt: Date.now(),
      start: points[0].day,
      values: points.map((p) => p.downloads),
    }

    const serialised = JSON.stringify(entry)
    if (serialised.length > MAX_ENTRY_BYTES) return

    store.setItem(key, serialised)
  } catch {
    // Quota exceeded or storage disabled -- a cache miss next time is fine.
    try {
      pruneExpired(store)
    } catch {
      /* nothing more we can do */
    }
  }
}

function pruneExpired(store: Storage): void {
  const doomed: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (!key?.startsWith(`${CACHE_VERSION}|`)) continue
    try {
      const entry = JSON.parse(store.getItem(key) ?? '') as CacheEntry
      if (Date.now() - entry.savedAt > TTL_MS) doomed.push(key)
    } catch {
      doomed.push(key)
    }
  }
  doomed.forEach((key) => {
    store.removeItem(key)
  })
}
