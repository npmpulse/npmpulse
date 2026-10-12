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

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '../lib/npm-api.ts'
import { must } from '../testing/must.ts'
import App from './App.tsx'

/** A stand-in npm downloads API, so no test touches the network. */
function stubUpstream() {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      urls.push(url)
      const match =
        /range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(url)
      if (!match) return new Response('{}', { status: 400 })

      const [, start, end, tail] = match
      const names = tail.split(',').map(decodeURIComponent)
      const days: Array<{ day: string; downloads: number }> = []
      let value = 1000
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        days.push({ day: cursor, downloads: value })
        value += 10
      }
      const body =
        names.length === 1
          ? { package: names[0], start, end, downloads: days }
          : Object.fromEntries(names.map((n) => [n, { downloads: days }]))
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
  return urls
}

const goTo = (search: string) =>
  window.history.replaceState({}, '', `/${search}`)

/** Mantine's pill remove buttons carry no accessible name, so class it is. */
const removeButtons = () =>
  [...document.querySelectorAll('.mantine-Pill-remove')] as HTMLElement[]
const pills = () =>
  [...document.querySelectorAll('.mantine-Pill-label')].map(
    (el) => el.textContent
  )

const DEFAULT_DEMO = ['react', 'lodash']

beforeEach(() => {
  window.localStorage.clear()
  goTo('')
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('App shell', () => {
  it('renders the product name', () => {
    stubUpstream()
    render(<App />)
    expect(screen.getByText('npmpulse')).toBeDefined()
  })

  it('claims no heading, because the page renders its own in real HTML', () => {
    // A heading inside a client-only island is missing from the served HTML --
    // which is the whole reason the page's h1 moved to `index.astro`.
    stubUpstream()
    render(<App />)
    expect(screen.queryAllByRole('heading')).toEqual([])
  })

  it('says what the site is, under the logo', () => {
    stubUpstream()
    render(<App />)
    expect(screen.getByText(/Any npm package's download history/)).toBeDefined()
  })

  it('starts from a default package so the page is never blank', async () => {
    stubUpstream()
    render(<App />)
    expect(await screen.findByText('react')).toBeDefined()
  })

  it('offers a theme switch', () => {
    stubUpstream()
    render(<App />)
    expect(screen.getByLabelText(/Switch to (dark|light) theme/)).toBeDefined()
  })

  it('toggles the colour scheme', async () => {
    stubUpstream()
    render(<App />)
    const toggle = screen.getByLabelText(/Switch to (dark|light) theme/)
    const before = toggle.getAttribute('aria-label')
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-label')).not.toBe(before)
  })
})

describe('App reading the URL', () => {
  it('takes the packages from the query string', async () => {
    stubUpstream()
    goTo('?q=vue,svelte')
    render(<App />)

    await waitFor(() =>
      expect(screen.getAllByText('vue').length).toBeGreaterThan(0)
    )
    expect(screen.getAllByText('svelte').length).toBeGreaterThan(0)
  })

  it('accepts the hash form, so a star-history-style link works', async () => {
    stubUpstream()
    goTo('#vue')
    render(<App />)

    await waitFor(() =>
      expect(screen.getAllByText('vue').length).toBeGreaterThan(0)
    )
  })

  it('splits a comma-joined package parameter', async () => {
    stubUpstream()
    goTo('?q=vue%2Csvelte')
    render(<App />)

    await waitFor(() =>
      expect(screen.getAllByText('vue').length).toBeGreaterThan(0)
    )
  })

  it('restores a pinned custom window', async () => {
    stubUpstream()
    goTo('?q=react&range=2024-01-01:2024-06-01')
    render(<App />)

    // The picker is what witnesses the window asked for. The line under the
    // controls describes the span drawn, which is shorter by the partial weeks
    // the aggregation drops -- so it is not the thing to assert here.
    await waitFor(() =>
      expect(
        screen.getByLabelText('Custom date range').textContent
      ).toBeDefined()
    )
    expect(screen.getByLabelText('Custom date range').textContent).toContain(
      'Jan 1, 2024'
    )
    expect(screen.getByLabelText('Custom date range').textContent).toContain(
      'Jun 1, 2024'
    )
  })

  it('describes the span it drew, in years, when the axis is yearly', async () => {
    stubUpstream()
    goTo('?q=react&range=all')
    render(<App />)

    // A shape, not a date: the window moves with today, and the partial first and
    // last years are dropped, so the span is whole years with no day in it.
    expect(await screen.findByText(/^\d{4} → \d{4}$/)).toBeDefined()
  })

  it('describes a monthly span in months', async () => {
    stubUpstream()
    goTo('?q=react&range=5y')
    render(<App />)

    expect(
      await screen.findByText(/^[A-Z][a-z]{2} \d{4} → [A-Z][a-z]{2} \d{4}$/)
    ).toBeDefined()
  })

  it('restores a preset window', async () => {
    stubUpstream()
    goTo('?q=react&range=5y')
    render(<App />)

    // Asserted on the control, not the readout: the readout now names the span
    // actually drawn, which moves with today's date and drops partial months.
    const selected = document.querySelector(
      'input[type="radio"][value="5y"]'
    ) as HTMLInputElement
    await waitFor(() => expect(selected.checked).toBe(true))
  })

  it('restores the granularity', async () => {
    stubUpstream()
    goTo('?q=react&range=all&granularity=yearly')
    render(<App />)

    const yearly = document.querySelector(
      'input[type="radio"][value="yearly"]'
    ) as HTMLInputElement
    await waitFor(() => expect(yearly.checked).toBe(true))
  })

  it('does not read the longer names the embed used to take', async () => {
    // The vocabulary is one spelling each now, so `packages=` names nothing and
    // the URL falls through to the worked example.
    stubUpstream()
    goTo('?packages=vue')
    render(<App />)

    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))
  })

  it('prefers the query over the hash when both name packages', async () => {
    stubUpstream()
    goTo('?q=vue#svelte')
    render(<App />)

    await waitFor(() => expect(pills()).toEqual(['vue']))
  })

  it('understands a plain day count, which the embed has always taken', async () => {
    stubUpstream()
    goTo('?q=react&range=90d')
    render(<App />)

    // 90 days draws a daily axis; the five-year default it would otherwise fall
    // back to is monthly, so the caption is what proves it was honoured.
    expect(await screen.findByText(/daily periods · 1 request/)).toBeDefined()
  })

  it('settles a day count onto the preset it equals', async () => {
    stubUpstream()
    goTo('?q=react&range=90d')
    render(<App />)

    // 90 days *is* the 3M preset, so the address bar says so once the state is
    // written back.
    await waitFor(() => expect(window.location.search).toContain('range=3m'))
  })

  it('falls back to the default range when the range makes no sense', async () => {
    stubUpstream()
    goTo('?q=react&range=5yy')
    render(<App />)

    expect(await screen.findByText(/monthly periods/)).toBeDefined()
  })

  it('restores a hidden series', async () => {
    stubUpstream()
    goTo('?q=react,vue&hide=vue')
    render(<App />)

    // The legend entry for the hidden package is still there, offering to put
    // it back.
    const entry = await screen.findByRole('button', { name: 'Show vue' })
    expect(entry.getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => expect(window.location.search).toContain('hide=vue'))
  })
})

describe('App writing the URL', () => {
  it('leaves a bare landing URL alone', async () => {
    // The default state's address *is* `/`, so there is nothing to record. A
    // query would make the front page look like a search result.
    stubUpstream()
    render(<App />)

    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
  })

  it('records a departure from the default', async () => {
    stubUpstream()
    render(<App />)
    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))

    await userEvent.type(
      screen.getByLabelText('npm package names'),
      'vue{Enter}'
    )

    await waitFor(() => expect(window.location.search).toContain('vue'))
    expect(window.location.search).toContain('q=react%2Clodash%2Cvue')
  })

  it('carries the whole state once it has departed, not just what changed', async () => {
    // A link has to describe the chart on its own; `?range=5y` alone would mean
    // whatever the default packages happen to be later.
    stubUpstream()
    render(<App />)
    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))

    await userEvent.click(screen.getByText('1Y'))

    await waitFor(() => expect(window.location.search).toContain('range=1y'))
    expect(window.location.search).toContain('q=react%2Clodash')
  })

  it('returns to a bare URL when the reader comes back to the default', async () => {
    // Not a glitch: `/` is that state's address, so the rule is working.
    stubUpstream()
    render(<App />)
    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))

    await userEvent.type(
      screen.getByLabelText('npm package names'),
      'vue{Enter}'
    )
    await waitFor(() => expect(window.location.search).toContain('vue'))

    await userEvent.click(
      must(removeButtons().at(-1), 'a package chip to remove')
    )

    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('records the chosen granularity once it is set by hand', async () => {
    stubUpstream()
    render(<App />)
    await userEvent.click(await screen.findByText('Yearly'))

    await waitFor(() =>
      expect(window.location.search).toContain('granularity=yearly')
    )
  })

  it('records the theme, which is a departure like any other', async () => {
    stubUpstream()
    render(<App />)
    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))

    await userEvent.click(screen.getByLabelText(/Switch to (dark|light) theme/))

    await waitFor(() =>
      expect(window.location.search).toMatch(/theme=(light|dark)/)
    )
  })

  it('shares the bare origin while the default is on screen', async () => {
    stubUpstream()
    render(<App />)
    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))

    const shareLink = must(
      (await screen.findByText(/Copy link/)).closest('button'),
      'the copy-link button'
    )
    expect(shareLink).toBeDefined()
    expect(window.location.href).toBe(`${window.location.origin}/`)
  })
})

describe('App package field', () => {
  it('starts on a worked example when the URL names no packages', async () => {
    // Two packages rather than one: a single series draws no legend, so a lone
    // default would not show the legend toggle the chart is built around.
    stubUpstream()
    render(<App />)
    await waitFor(() => expect(pills()).toEqual(DEFAULT_DEMO))
  })

  it('lets the last package be removed rather than putting it back', async () => {
    // Regression: an empty list used to be rewritten to the default, so the
    // field could not be cleared at all and the pill reappeared on removal.
    stubUpstream()
    goTo('?q=react')
    render(<App />)

    await waitFor(() => expect(pills()).toEqual(['react']))
    await userEvent.click(removeButtons()[0])

    expect(pills()).toEqual([])
    await waitFor(() => expect(window.location.search).toContain('q='))
  })

  it('says what to do once the field is empty', async () => {
    stubUpstream()
    goTo('?q=react')
    render(<App />)

    await waitFor(() => expect(pills()).toEqual(['react']))
    await userEvent.click(removeButtons()[0])

    expect(await screen.findByText(/Enter a package name/)).toBeDefined()
  })

  it('stands the other panels down while there is nothing to chart', async () => {
    stubUpstream()
    goTo('?q=react')
    render(<App />)

    await waitFor(() => expect(pills()).toEqual(['react']))
    await userEvent.click(removeButtons()[0])

    await waitFor(() =>
      expect(screen.queryByText('Embed this chart')).toBeNull()
    )
    expect(screen.queryByText('Package')).toBeNull()
  })

  it('keeps a cleared field cleared through a reload', async () => {
    // An explicitly empty ?q= is a state the reader chose; only a URL with no
    // package parameter at all opens on the example.
    stubUpstream()
    goTo('?q=')
    render(<App />)

    await waitFor(() => expect(window.location.search).toContain('q='))
    expect(pills()).toEqual([])
    expect(await screen.findByText(/Enter a package name/)).toBeDefined()
  })

  it('adds to an emptied field', async () => {
    stubUpstream()
    goTo('?q=')
    render(<App />)
    await screen.findByText(/Enter a package name/)

    await userEvent.type(
      screen.getByLabelText('npm package names'),
      'vue{Enter}'
    )

    await waitFor(() => expect(pills()).toEqual(['vue']))
  })
})

describe('App legend toggling', () => {
  const swatchColor = (name: string) => {
    const button = screen.getByRole('button', {
      name: new RegExp(`(Hide|Show) ${name}$`),
    })
    return (button.querySelector('span[aria-hidden]') as HTMLElement).style
      .borderColor
  }

  it('hides a package when its legend entry is clicked', async () => {
    stubUpstream()
    goTo('?q=react,vue&range=1y')
    render(<App />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Hide vue' })
    )

    expect(
      await screen.findByRole('button', { name: 'Show vue' })
    ).toBeDefined()
    await waitFor(() => expect(window.location.search).toContain('hide=vue'))
  })

  it('keeps a hidden entry in the legend, so it can be switched back on', async () => {
    // Regression: the chart was handed only the drawn packages, so a hidden one
    // vanished from the legend along with its line and there was nothing left
    // to click to bring it back.
    stubUpstream()
    goTo('?q=react,vue&range=1y')
    render(<App />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Hide vue' })
    )
    const hiddenEntry = await screen.findByRole('button', { name: 'Show vue' })

    await userEvent.click(hiddenEntry)
    expect(
      await screen.findByRole('button', { name: 'Hide vue' })
    ).toBeDefined()
    await waitFor(() =>
      expect(window.location.search).not.toContain('hide=vue')
    )
  })

  it('round-trips a toggle repeatedly rather than latching', async () => {
    stubUpstream()
    goTo('?q=react,vue,svelte&range=1y')
    render(<App />)

    for (let round = 0; round < 3; round++) {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Hide svelte' })
      )
      await userEvent.click(
        await screen.findByRole('button', { name: 'Show svelte' })
      )
    }
    expect(
      await screen.findByRole('button', { name: 'Hide svelte' })
    ).toBeDefined()
  })

  it('does not repaint the remaining lines when one is hidden', async () => {
    // Colour follows the package, not its position among the drawn ones.
    stubUpstream()
    goTo('?q=react,vue,svelte&range=1y')
    render(<App />)

    await screen.findByRole('button', { name: 'Hide react' })
    const before = { vue: swatchColor('vue'), svelte: swatchColor('svelte') }

    await userEvent.click(screen.getByRole('button', { name: 'Hide react' }))

    expect(swatchColor('vue')).toBe(before.vue)
    expect(swatchColor('svelte')).toBe(before.svelte)
  })

  it('keeps the legend on screen when only one line is left', async () => {
    // Otherwise the last hidden line could never be brought back.
    stubUpstream()
    goTo('?q=react,vue&range=1y')
    render(<App />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Hide vue' })
    )

    expect(
      screen.getByRole('button', { name: /must stay visible/ })
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Show vue' })).toBeDefined()
  })
})

describe('App after loading', () => {
  it('shows per-package figures', async () => {
    stubUpstream()
    render(<App />)

    expect(await screen.findByText('Package')).toBeDefined()
    expect(screen.getByText('Total')).toBeDefined()
    expect(screen.getByText('Total')).toBeDefined()
  })

  it('offers an embed once there is a chart', async () => {
    stubUpstream()
    render(<App />)

    expect(await screen.findByText('Embed this chart')).toBeDefined()
    // The Markdown and HTML snippets both carry the endpoint, and Mantine keeps
    // the inactive tab panel mounted, so expect more than one.
    expect(
      (await screen.findAllByText(/api\/svg\?q=react/)).length
    ).toBeGreaterThan(0)
  })

  it('refetches when a package is added', async () => {
    const urls = stubUpstream()
    render(<App />)
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    const before = urls.length

    await userEvent.type(
      screen.getByLabelText('npm package names'),
      'vue{Enter}'
    )

    await waitFor(() => expect(urls.length).toBeGreaterThan(before))
    expect(urls.at(-1)).toContain('vue')
  })

  it('puts the failing API message on screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'nope' }), { status: 404 })
      )
    )
    render(<App />)

    expect(
      await screen.findByText('Could not load download data')
    ).toBeDefined()
    // Reported in two places on purpose: against the field, and in the panel
    // where the chart would have been.
    expect(screen.getAllByText(/Package not found/).length).toBeGreaterThan(0)
  })

  it('reports how many periods and requests the figures cover', async () => {
    stubUpstream()
    goTo('?q=react&range=1y')
    render(<App />)

    // One caption carries both figures: "52 weekly periods · 1 request".
    expect(await screen.findByText(/weekly periods · 1 request/)).toBeDefined()
  })
})
