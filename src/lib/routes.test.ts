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
import { PAIRS, pairSlug } from './pairs.ts'
import { siteRoutes } from './routes.ts'
import { SNAPSHOT_PACKAGES } from './snapshot.ts'

/** The six fixed hubs, plus `/`. Everything else is a package or a pair. */
const HUBS = [
  '/',
  '/packages',
  '/compare',
  '/data',
  '/data/2015-vs-today',
  '/data/how-it-started',
  '/data/fastest-growing',
]

describe('siteRoutes', () => {
  const routes = siteRoutes()

  it('lists a page for every package in the snapshot', () => {
    for (const name of SNAPSHOT_PACKAGES) expect(routes).toContain(`/${name}`)
  })

  it('lists a page for every published pair', () => {
    for (const pair of PAIRS) {
      expect(routes).toContain(`/compare/${pairSlug(pair.a, pair.b)}`)
    }
  })

  it('lists the fixed hubs', () => {
    for (const hub of HUBS) expect(routes).toContain(hub)
  })

  it('emits each address exactly once', () => {
    // Two entries for one URL is a sitemap telling a crawler the page is two
    // pages, and the sitemap is generated from this list.
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('carries paths, never absolute URLs', () => {
    for (const route of routes) expect(route.startsWith('/')).toBe(true)
  })

  it('is exactly the hubs, the packages and the pairs, and nothing else', () => {
    expect(routes.length).toBe(
      HUBS.length + SNAPSHOT_PACKAGES.length + PAIRS.length
    )
  })
})
