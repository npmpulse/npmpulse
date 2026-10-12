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
import { must } from '../testing/must.ts'
import { Logo, LogoWithTitle } from './Logo.tsx'

describe('Logo', () => {
  it('hides the mark from assistive tech, since the wordmark carries the name', () => {
    const { container } = render(
      <MantineProvider>
        <Logo />
      </MantineProvider>
    )
    expect(
      must(container.querySelector('svg'), 'the mark').getAttribute(
        'aria-hidden'
      )
    ).toBe('true')
  })

  it('draws on the same 32-unit grid the favicon clips', () => {
    const { container } = render(
      <MantineProvider>
        <Logo />
      </MantineProvider>
    )
    expect(
      must(container.querySelector('svg'), 'the mark').getAttribute('viewBox')
    ).toBe('0 0 32 32')
  })

  it('scales to the size it is given', () => {
    const { container } = render(
      <MantineProvider>
        <Logo size={40} />
      </MantineProvider>
    )
    const mark = must(container.querySelector('svg'), 'the mark')
    expect(mark.getAttribute('width')).toBe('40')
    expect(mark.getAttribute('height')).toBe('40')
  })

  it('paints in currentColor, so a header can theme it by doing nothing', () => {
    const { container } = render(
      <MantineProvider>
        <Logo />
      </MantineProvider>
    )
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(2)
    expect(paths[0].getAttribute('fill')).toBe('currentColor')
    expect(paths[1].getAttribute('stroke')).toBe('currentColor')
  })
})

describe('LogoWithTitle', () => {
  it('shows the name without claiming a heading', () => {
    render(
      <MantineProvider>
        <LogoWithTitle />
      </MantineProvider>
    )
    expect(screen.getByText('npmpulse')).toBeDefined()
    // The mark is aria-hidden and the wordmark is not a heading: the page's one
    // h1 lives in `index.astro`, where it survives without JavaScript.
    expect(screen.queryAllByRole('heading')).toEqual([])
  })

  it('links back to the bare origin, which is the default chart', () => {
    const { container } = render(
      <MantineProvider>
        <LogoWithTitle />
      </MantineProvider>
    )
    expect(
      must(container.querySelector('a'), 'the link').getAttribute('href')
    ).toBe('/')
  })
})
