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
import { GROUPS, groupOf, SOLO_PACKAGES, TRACKED_PACKAGES } from './packages.ts'

describe('groupOf', () => {
  it('finds the group a package is compared within', () => {
    expect(groupOf('react')?.label).toBe('UI frameworks')
    // A hyphenated name is still one member of its group.
    expect(groupOf('solid-js')?.packages).toContain('preact')
  })

  it('finds nothing for a package in no group', () => {
    // Tracked for its own page, but not an alternative to anything.
    expect(groupOf('typescript')).toBeUndefined()
    expect(groupOf('not-a-package')).toBeUndefined()
  })
})

describe('the curated list', () => {
  it('caps every group at four, so its pair pages stay bounded', () => {
    // A group of n produces n(n-1)/2 pair pages; five already means ten.
    for (const group of GROUPS) {
      expect(group.packages.length, group.label).toBeLessThanOrEqual(4)
      expect(group.packages.length, group.label).toBeGreaterThan(1)
    }
  })

  it('tracks group members and solo packages, each exactly once', () => {
    const listed = [
      ...GROUPS.flatMap((group) => group.packages),
      ...SOLO_PACKAGES,
    ]
    expect(new Set(listed).size).toBe(listed.length)
    expect(new Set(TRACKED_PACKAGES)).toEqual(new Set(listed))
  })
})
