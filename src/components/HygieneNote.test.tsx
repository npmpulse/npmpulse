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

import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HygieneReport } from '../lib/aggregate.ts'
import { must } from '../testing/must.ts'
import { HygieneNote } from './HygieneNote.tsx'

const report = (over: Partial<HygieneReport> = {}): HygieneReport => ({
  trimmedHead: 0,
  trimmedTail: 0,
  filledGaps: 0,
  firstRealDay: '2015-02-27',
  lastRealDay: '2026-10-10',
  ...over,
})

const show = (value: HygieneReport) =>
  render(
    <MantineProvider>
      <HygieneNote report={value} />
    </MantineProvider>
  )

describe('HygieneNote', () => {
  it('stays silent when nothing was changed', () => {
    const { container } = show(report())
    expect(container.textContent).not.toContain('leading days')
    expect(container.textContent).not.toContain('interpolated')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('reports trimmed leading days', () => {
    show(report({ trimmedHead: 48 }))
    expect(
      screen.getByText(/48 leading days before npm has any record/)
    ).toBeDefined()
  })

  it('reports trimmed trailing days', () => {
    show(report({ trimmedTail: 2 }))
    expect(
      screen.getByText(/2 trailing days npm has not finalised/)
    ).toBeDefined()
  })

  it('reports interpolated interior gaps', () => {
    show(report({ filledGaps: 11 }))
    expect(
      screen.getByText(/11 interior missing days interpolated/)
    ).toBeDefined()
  })

  it('singularises a count of one', () => {
    show(report({ trimmedHead: 1, trimmedTail: 1, filledGaps: 1 }))
    const text = must(document.body.textContent, 'the rendered note')
    expect(text).toContain('1 leading day before')
    expect(text).toContain('1 trailing day npm has not')
    expect(text).toContain('1 interior missing day interpolated')
  })

  it('joins several disclosures into one sentence', () => {
    show(report({ trimmedHead: 48, trimmedTail: 2, filledGaps: 11 }))
    const text = must(document.body.textContent, 'the rendered note')
    expect(text).toContain('48 leading days')
    expect(text).toContain('2 trailing days')
    expect(text).toContain('11 interior missing days')
    expect(text).toContain(' · ')
  })
})
