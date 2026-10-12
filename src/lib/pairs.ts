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
 * The comparison pages, derived from the groups in `packages.ts`.
 *
 * Every unordered pair inside a group, and nothing across groups: `react vs vue`
 * is a thing people search for, `react vs mongoose` is not, and the cross-product
 * of everything would be a few thousand pages differing only by the two names in
 * the title. Keeping the groups at four members caps a group at six pages.
 */

import { GROUPS } from './packages.ts'

export interface Pair {
  /** Group order, which is also the order the slug is written in. */
  a: string
  b: string
  /** What the two have in common, for the heading and the links between them. */
  label: string
}

export const PAIRS: readonly Pair[] = GROUPS.flatMap((group) =>
  group.packages.flatMap((a, index) =>
    group.packages.slice(index + 1).map((b) => ({ a, b, label: group.label }))
  )
)

export function pairSlug(a: string, b: string): string {
  return `${a}-vs-${b}`
}

/**
 * The pair a slug names, or null when it is not one this site publishes.
 *
 * Package names contain hyphens (`date-fns`, `solid-js`), so the separator has to
 * be `-vs-` rather than `-`, and the split has to yield exactly two parts -- a
 * name that itself contained `-vs-` would otherwise silently match a different
 * pair.
 */
export function pairFromSlug(slug: string): Pair | null {
  const parts = slug.split('-vs-')
  if (parts.length !== 2) return null
  const [a, b] = parts
  return PAIRS.find((pair) => pair.a === a && pair.b === b) ?? null
}

/** Pairs sharing a member, for the links at the foot of a comparison. */
export function pairsWith(name: string): Pair[] {
  return PAIRS.filter((pair) => pair.a === name || pair.b === name)
}
