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
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { must } from '../testing/must.ts'
import { GranularityToggle, PackageTags, ScaleToggle } from './Controls.tsx'

const wrap = (ui: React.ReactNode) =>
  render(<MantineProvider>{ui}</MantineProvider>)

/* ----------------------------------------------------------- PackageTags */

describe('PackageTags', () => {
  const props = {
    value: ['react', 'vue'],
    loading: false,
    error: null,
    onChange: () => {},
    onRefresh: () => {},
  }

  it('shows each package as a removable pill', () => {
    wrap(<PackageTags {...props} />)
    expect(screen.getByText('react')).toBeDefined()
    expect(screen.getByText('vue')).toBeDefined()
  })

  it('prompts for the first package when empty', () => {
    wrap(<PackageTags {...props} value={[]} />)
    expect(
      screen.getByPlaceholderText('Add a package, e.g. react')
    ).toBeDefined()
  })

  it('prompts for another once one exists', () => {
    wrap(<PackageTags {...props} />)
    expect(screen.getByPlaceholderText('Add another…')).toBeDefined()
  })

  it('normalises whatever the input produces', async () => {
    // A pasted "a,b" can arrive as one pill; the count must match what the API
    // will read from the URL or the chunk size is chosen for the wrong shape.
    const onChange = vi.fn()
    wrap(<PackageTags {...props} value={[]} onChange={onChange} />)

    await userEvent.type(
      screen.getByLabelText('npm package names'),
      'vue,svelte{Enter}'
    )
    expect(onChange).toHaveBeenCalled()
    const last = must(onChange.mock.calls.at(-1), 'an onChange call')[0]
    expect(last).not.toContain('vue,svelte')
  })

  it('caps the list at eight', async () => {
    const onChange = vi.fn()
    wrap(<PackageTags {...props} value={[]} onChange={onChange} />)
    await userEvent.type(
      screen.getByLabelText('npm package names'),
      'one{Enter}'
    )
    const last = must(onChange.mock.calls.at(-1), 'an onChange call')[0]
    expect(last.length).toBeLessThanOrEqual(8)
  })

  it('offers a re-fetch control', async () => {
    const onRefresh = vi.fn()
    wrap(<PackageTags {...props} onRefresh={onRefresh} />)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('shows a loading state while fetching', () => {
    wrap(<PackageTags {...props} loading />)
    // Mantine puts a loader inside the button rather than replacing the label.
    expect(
      document.querySelector('.mantine-Button-loader, [data-loading]')
    ).not.toBeNull()
  })

  it('surfaces an error against the field', () => {
    wrap(
      <PackageTags
        {...props}
        error="Package not found on npm: &quot;nope&quot;"
      />
    )
    expect(screen.getByText(/Package not found/)).toBeDefined()
  })

  it('explains the limit', () => {
    wrap(<PackageTags {...props} />)
    expect(screen.getByText(/Add up to 8 packages/)).toBeDefined()
  })
})

/* ---------------------------------------------------- GranularityToggle */

describe('GranularityToggle', () => {
  it('offers the four granularities', () => {
    wrap(<GranularityToggle value="daily" onChange={() => {}} />)
    for (const label of ['Daily', 'Weekly', 'Monthly', 'Yearly']) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })

  it('marks the active one', () => {
    wrap(<GranularityToggle value="monthly" onChange={() => {}} />)
    const active = document.querySelector(
      'input[type="radio"][value="monthly"]'
    ) as HTMLInputElement
    expect(active.checked).toBe(true)
  })

  it('reports a change', async () => {
    const onChange = vi.fn()
    wrap(<GranularityToggle value="daily" onChange={onChange} />)
    await userEvent.click(screen.getByText('Yearly'))
    expect(onChange).toHaveBeenCalledWith('yearly')
  })
})

/* ---------------------------------------------------------- ScaleToggle */

describe('ScaleToggle', () => {
  it('offers linear and log', () => {
    wrap(<ScaleToggle value="linear" onChange={() => {}} />)
    expect(screen.getByText('Linear')).toBeDefined()
    expect(screen.getByText('Log')).toBeDefined()
  })

  it('reports a change', async () => {
    const onChange = vi.fn()
    wrap(<ScaleToggle value="linear" onChange={onChange} />)
    await userEvent.click(screen.getByText('Log'))
    expect(onChange).toHaveBeenCalledWith('log')
  })
})
