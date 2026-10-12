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
 * Live checks against the real npm downloads API.
 *
 * Everything that can be verified hermetically now lives in `test/` and runs
 * under vitest. What remains here is the part that is only meaningful against
 * the actual service: that our chunking really does reassemble the full history,
 * that the API still behaves the way the client assumes, and that a comparison
 * including a scoped package really does work end to end.
 *
 * Run with `pnpm check:live`. It makes real requests, so it is slow and can be
 * rate-limited (429) -- that is the point, and it is why it is not part of the
 * test suite.
 */

import {
  DATA_START,
  dayDiff,
  fetchDownloads,
  todayISO,
} from '../src/lib/npm-api.ts'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const END = todayISO()

console.log('\n=== full history for one package ===')
{
  const result = await fetchDownloads(['react'], {
    start: DATA_START,
    end: END,
  })
  const points = result.series.react

  check(
    'assembled from 8 chunked requests',
    result.requests === 8,
    `got ${result.requests}`
  )
  check(
    'no silent truncation',
    points[0]?.day === DATA_START,
    `first day ${points[0]?.day}`
  )
  check('a full span of days', points.length >= 4290, `${points.length} days`)
  check(
    'strictly ascending and unique',
    points.every((p, i) => i === 0 || p.day > points[i - 1].day)
  )

  const zeros = points.filter((p) => p.downloads === 0).length
  console.log(
    `  ${points.length} days, ${zeros} zero-value days (${((zeros / points.length) * 100).toFixed(2)}%)`
  )
}

console.log('\n=== the invariant the 400 bug came from ===')
// A request the API reads as N packages must be sized for N packages. Sizing
// a multi-segment request as a single-package one sends a 549-day window the
// API rejects.
for (const packages of [
  ['react,vue'],
  ['react', 'vue'],
  ['@babel/core', 'react'],
]) {
  try {
    const result = await fetchDownloads(packages, {
      start: '2025-10-13',
      end: END,
    })
    const names = Object.keys(result.series)
    check(
      `${JSON.stringify(packages)} → ${names.join(', ')} (${result.requests} requests)`,
      names.length > 0
    )
  } catch (error) {
    check(`${JSON.stringify(packages)}`, false, (error as Error).message)
  }
}

console.log('\n=== scoped packages travel on their own stream ===')
{
  const result = await fetchDownloads(['@babel/core', 'react'], {
    start: DATA_START,
    end: END,
  })
  check('both packages returned', Object.keys(result.series).length === 2)
  check(
    'two streams, so 16 requests',
    result.requests === 16,
    `got ${result.requests}`
  )
}

console.log('\n=== bulk sizing still honours the 365-day cap ===')
{
  const result = await fetchDownloads(['react', 'vue'], {
    start: DATA_START,
    end: END,
  })
  check(
    'more chunks than a single package needs',
    result.requests > 8,
    `got ${result.requests}`
  )
  const span = dayDiff(DATA_START, END) + 1
  console.log(`  ${span} days over ${result.requests} bulk requests`)
}

console.log('\n=== error paths ===')
try {
  await fetchDownloads(['this-package-does-not-exist-xyz-123'], {
    start: '2026-01-01',
    end: END,
  })
  check('a missing package is reported', false, 'it succeeded')
} catch (error) {
  check(
    'a missing package is reported',
    /not found/i.test((error as Error).message)
  )
}

console.log(
  `\n${failures === 0 ? '✅ all live checks passed' : `❌ ${failures} failed`}`
)
process.exit(failures === 0 ? 0 : 1)
