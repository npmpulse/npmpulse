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
 * Embed-endpoint parameters and response shapes.
 *
 * Kept out of the Worker's entry module on purpose. workerd treats *every*
 * named export of the entry module as a potential handler, so exporting a plain
 * value like `DEFAULT_HEIGHT` from `index.ts` makes the runtime refuse to start
 * the whole Worker:
 *
 *   Uncaught TypeError: Incorrect type for map entry 'DEFAULT_HEIGHT':
 *   the provided value is not of type 'function or ExportedHandler'
 *
 * Anything the tests need to reach therefore lives here, and `index.ts` exports
 * only its default handler.
 */

import type { ThemeMode } from '../src/lib/theme.ts'

/** Charts get unreadable past a handful of series, and the API allows 128. */
export const MAX_EMBED_PACKAGES = 8

/**
 * Cold-cache CPU budget guard.
 *
 * The free plan allows 10ms of CPU per request, and the unavoidable cost here
 * is parsing the upstream JSON -- measured at ~0.4ms for the default embed
 * (one package, one year) but ~13ms for eight packages across the full history,
 * because that response is 1.3MB. Aggregating to monthly or yearly does not
 * help: the daily data still has to be fetched and parsed first.
 *
 * So requests whose payload would exceed the budget are refused with an
 * actionable message rather than left to fail as an opaque 500. This caps
 * packages x days at roughly 500KB of JSON; the interactive site is unaffected,
 * because browser CPU is neither metered nor capped.
 */
export const MAX_PACKAGE_DAYS = 12_000
export const DEFAULT_WIDTH = 820
export const DEFAULT_HEIGHT = 380

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export function svgResponse(svg: string, cacheSeconds: number): Response {
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 24}, immutable`,
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  })
}

export function errorSvg(message: string, theme: ThemeMode): Response {
  const surface = theme === 'dark' ? '#1a1a19' : '#fcfcfb'
  const ink = theme === 'dark' ? '#c3c2b7' : '#52514e'
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="120" viewBox="0 0 820 120">` +
    `<rect width="820" height="120" fill="${surface}"/>` +
    `<text x="410" y="64" fill="${ink}" text-anchor="middle" ` +
    `font-family="ui-sans-serif,system-ui,sans-serif" font-size="13">${escaped}</text></svg>`
  // 400 so a broken embed is visible in devtools, but still an image so READMEs
  // show the message rather than a broken-image icon.
  return new Response(svg, {
    status: 400,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  })
}
