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
import { GROUPS } from './packages.ts'
import { PAIRS, pairFromSlug, pairSlug, pairsWith } from './pairs.ts'

describe('PAIRS', () => {
  it('pairs every member of a group with every other, once', () => {
    const expected = GROUPS.reduce(
      (total, group) =>
        total + (group.packages.length * (group.packages.length - 1)) / 2,
      0
    )
    expect(PAIRS.length).toBe(expected)
    expect(new Set(PAIRS.map((p) => pairSlug(p.a, p.b))).size).toBe(
      PAIRS.length
    )
  })

  it('never pairs across groups', () => {
    // `react vs mongoose` is not a page anyone wants.
    for (const pair of PAIRS) {
      const shared = GROUPS.some(
        (group) =>
          group.packages.includes(pair.a) && group.packages.includes(pair.b)
      )
      expect(shared, `${pair.a} vs ${pair.b}`).toBe(true)
    }
  })
})

describe('pairFromSlug', () => {
  it('round-trips every published pair', () => {
    for (const pair of PAIRS) {
      expect(pairFromSlug(pairSlug(pair.a, pair.b))).toEqual(pair)
    }
  })

  it('reads a hyphenated name as one name, not two', () => {
    // The separator has to survive `date-fns` and `solid-js`.
    expect(pairFromSlug('moment-vs-date-fns')).toMatchObject({
      a: 'moment',
      b: 'date-fns',
    })
    expect(pairFromSlug('date-fns-vs-luxon')).toMatchObject({
      a: 'date-fns',
      b: 'luxon',
    })
    // Group order decides the slug, so a hyphenated name can be either side.
    expect(pairFromSlug('preact-vs-solid-js')).toMatchObject({
      a: 'preact',
      b: 'solid-js',
    })
    expect(pairFromSlug('solid-js-vs-preact')).toBeNull()
  })

  it('rejects a reversed slug, so one comparison has one address', () => {
    expect(pairFromSlug('vue-vs-react')).toBeNull()
  })

  it('rejects pairs it does not publish', () => {
    expect(pairFromSlug('react-vs-axios')).toBeNull()
    expect(pairFromSlug('react-vs-react')).toBeNull()
    expect(pairFromSlug('react')).toBeNull()
    expect(pairFromSlug('react-vs-vue-vs-svelte')).toBeNull()
  })
})

describe('pairsWith', () => {
  it('finds the siblings a package is compared with', () => {
    expect(pairsWith('react').map((p) => pairSlug(p.a, p.b))).toEqual([
      'react-vs-vue',
      'react-vs-svelte',
      'react-vs-angular',
    ])
  })

  it('finds nothing for a package in no group', () => {
    expect(pairsWith('typescript')).toEqual([])
  })
})
