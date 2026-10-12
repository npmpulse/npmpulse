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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresetKey } from '../lib/range.ts'
import { daysFrom, seriesOf } from '../testing/fixtures.ts'
import { must } from '../testing/must.ts'
import { EmbedPanel } from './EmbedPanel.tsx'

const props = {
  packages: ['react'],
  preset: '1y' as PresetKey,
  start: '2025-10-12',
  end: '2026-10-12',
  granularity: 'weekly' as const,
  scale: 'linear' as const,
}

const legacy = {
  dates: daysFrom('2026-01-01', 5),
  series: [{ name: 'react', values: [1, 2, 3, 4, 5] }],
}

type ShowOverrides = Partial<typeof props> & {
  dates?: string[]
  series?: Array<{ name: string; values: Array<number | null> }>
}

const show = ({ dates, series, ...over }: ShowOverrides = {}) =>
  render(
    <MantineProvider>
      <EmbedPanel
        {...props}
        {...over}
        series={seriesOf(
          dates || series
            ? { dates: dates ?? legacy.dates, series: series ?? legacy.series }
            : legacy
        )}
      />
    </MantineProvider>
  )

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EmbedPanel snippets', () => {
  it('renders nothing without packages', () => {
    const { container } = show({ packages: [] })
    expect(container.textContent).not.toContain('Embed this chart')
  })

  it('builds a markdown embed pointing at the svg endpoint', () => {
    show()
    const snippet = must(
      screen.getByText(/!\[npm downloads\]/).textContent,
      'the embed snippet text'
    )
    expect(snippet).toContain('/api/svg?q=react')
    expect(snippet).toContain('range=1y')
    expect(snippet).toContain('granularity=weekly')
  })

  it('keeps a preset relative so the embed keeps updating on its own', () => {
    show({ preset: '5y' })
    expect(screen.getByText(/!\[npm downloads\]/).textContent).toContain(
      'range=5y'
    )
  })

  it('pins a hand-picked window to exact dates', () => {
    // A custom range has no relative form, so it has to record the days.
    show({ preset: 'custom' })
    expect(screen.getByText(/!\[npm downloads\]/).textContent).toContain(
      'range=2025-10-12%3A2026-10-12'
    )
  })

  it('omits a theme parameter for the default light', () => {
    show()
    expect(screen.getByText(/!\[npm downloads\]/).textContent).not.toContain(
      'theme='
    )
  })

  it('offers a dark-mode-aware HTML snippet', async () => {
    show()
    await userEvent.click(screen.getByText('HTML (dark mode aware)'))

    const html = must(document.body.textContent, 'the rendered body')
    expect(html).toContain('<picture>')
    expect(html).toContain('prefers-color-scheme: dark')
    expect(html).toContain('theme=dark')
  })

  it('links the image to the site, so a click does something useful', () => {
    show()
    expect(screen.getByText(/!\[npm downloads\]/).textContent).toContain(
      '#react'
    )
  })

  it('reports the eight-package ceiling instead of emitting a broken embed', () => {
    show({ packages: Array.from({ length: 9 }, (_, i) => `p${i}`) })
    expect(screen.getByText(/Embeds support up to 8 packages/)).toBeDefined()
    expect(screen.queryByText('Markdown')).toBeNull()
  })

  it('puts the copy button inside the block rather than beside it', () => {
    // It sits on the block's first line, so the two share a positioned parent.
    show()
    const pre = must(document.querySelector('pre'), 'the code block')
    const copy = screen.getAllByText('Copy')[0]
    expect(pre.parentElement?.contains(copy)).toBe(true)
  })

  it('keeps the copy button clear of the code text', () => {
    // The block reserves a right-hand column for it, so a long first line wraps
    // instead of running underneath the button.
    show()
    const pre = document.querySelector('pre') as HTMLElement
    expect(Number.parseFloat(pre.style.paddingRight)).toBeGreaterThanOrEqual(70)
  })

  it('anchors the copy button to the block top, not its centre', () => {
    // So it aligns with the first line however many lines follow -- the HTML
    // snippet is multi-line and the markdown one usually is not.
    show()
    // getByText lands on Mantine's inner label span; the styles are on the
    // button around it.
    const copy = screen
      .getAllByText('Copy')[0]
      .closest('button') as HTMLButtonElement
    expect(copy.style.position).toBe('absolute')
    expect(Number.parseFloat(copy.style.top)).toBeLessThan(12)
  })

  it('explains the hosting requirement', () => {
    show()
    expect(
      screen.getByText(/only works on the Cloudflare deployment/)
    ).toBeDefined()
  })
})

describe('EmbedPanel downloads', () => {
  function stubDownload() {
    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob)
        return 'blob:stub'
      }),
      revokeObjectURL: vi.fn(),
    })
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download)
    })
    return { blobs, clicks }
  }

  it('saves an SVG built from the data on screen', async () => {
    const { blobs, clicks } = stubDownload()
    show()
    await userEvent.click(screen.getByText('Download SVG'))

    expect(clicks).toEqual(['react-downloads.svg'])
    expect(blobs[0].type).toBe('image/svg+xml')
    await expect(blobs[0].text()).resolves.toContain('<svg')
  })

  it('names the file after every package in the comparison', async () => {
    const { clicks } = stubDownload()
    show({
      packages: ['react', 'vue'],
      series: [
        { name: 'react', values: [1] },
        { name: 'vue', values: [2] },
      ],
    })
    await userEvent.click(screen.getByText('Download SVG'))
    expect(clicks).toEqual(['react-vue-downloads.svg'])
  })

  it('sanitises package names for the filename', async () => {
    const { clicks } = stubDownload()
    show({
      packages: ['@babel/core'],
      series: [{ name: '@babel/core', values: [1] }],
    })
    await userEvent.click(screen.getByText('Download SVG'))
    expect(clicks[0]).not.toContain('/')
  })
})

describe('EmbedPanel PNG export', () => {
  /**
   * jsdom never loads an image or rasterises a canvas, so the PNG path is
   * driven by hand: a fake Image that fires onload when its src is set, and a
   * canvas that reports a 2d context and hands back a blob.
   */
  function stubRaster(
    options: { withContext?: boolean; blob?: Blob | null } = {}
  ) {
    const withContext = options.withContext ?? true

    class FakeImage {
      onload: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)

    const drawn: number[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      withContext
        ? ({
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(() => drawn.push(1)),
          } as unknown as CanvasRenderingContext2D)
        : null
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback: BlobCallback) => {
        const blob =
          options.blob === undefined
            ? new Blob(['png-bytes'], { type: 'image/png' })
            : options.blob
        callback(blob)
      }
    )

    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob)
        return 'blob:stub'
      }),
      revokeObjectURL: vi.fn(),
    })
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download)
    })

    return { blobs, clicks, drawn }
  }

  it('rasterises the chart to a PNG', async () => {
    const { blobs, clicks, drawn } = stubRaster()
    show()
    await userEvent.click(screen.getByText('Download PNG'))

    await waitFor(() => expect(clicks).toEqual(['react-downloads.png']))
    expect(drawn).toHaveLength(1) // drawImage ran
    expect(blobs[0].type).toBe('image/png')
  })

  it('paints the chart surface behind the image', async () => {
    const fills: string[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      set fillStyle(value: string) {
        fills.push(value)
      },
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    class FakeImage {
      onload: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:stub'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    show()
    await userEvent.click(screen.getByText('Download PNG'))

    await waitFor(() => expect(fills).toContain('#fcfcfb'))
  })

  it('gives up quietly when the canvas has no 2d context', async () => {
    const { blobs, clicks } = stubRaster({ withContext: false })
    show()
    await userEvent.click(screen.getByText('Download PNG'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(clicks).toEqual([])
    expect(blobs).toEqual([])
  })

  it('gives up quietly when rasterising yields no blob', async () => {
    const { blobs, clicks } = stubRaster({ blob: null })
    show()
    await userEvent.click(screen.getByText('Download PNG'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(clicks).toEqual([])
    expect(blobs).toEqual([])
  })
})
