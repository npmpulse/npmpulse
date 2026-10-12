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
 * Every URL the static build produces, in a stable order.
 *
 * One list, so the sitemap and any internal linking cannot disagree with what
 * was actually generated. Each page family adds itself here as it arrives.
 */

import { PAIRS, pairSlug } from './pairs.ts'
import { SNAPSHOT_PACKAGES } from './snapshot.ts'

export function siteRoutes(): string[] {
  return [
    '/',
    '/packages',
    '/compare',
    '/data',
    '/data/2015-vs-today',
    '/data/how-it-started',
    '/data/fastest-growing',
    ...SNAPSHOT_PACKAGES.map((name) => `/${name}`),
    ...PAIRS.map((pair) => `/compare/${pairSlug(pair.a, pair.b)}`),
  ]
}
