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

import {
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  Stack,
  Tabs,
  Text,
  useComputedColorScheme,
} from '@mantine/core'
import { useState } from 'react'
import type { Granularity } from '../lib/aggregate.ts'
import { PACKAGE_PARAM } from '../lib/params.ts'
import type { PresetKey } from '../lib/range.ts'
import { type ChartSeries, renderChart } from '../lib/svg-chart.ts'
import type { ScaleKind } from './DownloadChart.tsx'

interface Props {
  packages: string[]
  preset: PresetKey
  start: string
  end: string
  granularity: Granularity
  scale: ScaleKind
  /** Already-prepared chart data, reused so the export matches what is on screen. */
  series: ChartSeries[]
}

function buildEmbedPath(
  { packages, preset, start, end, granularity, scale }: Omit<Props, 'series'>,
  theme: 'light' | 'dark'
): string {
  const params = new URLSearchParams()
  params.set(PACKAGE_PARAM, packages.join(','))
  // A preset stays relative so the embedded chart keeps updating; a hand-picked
  // window has to be pinned to exact dates.
  params.set('range', preset === 'custom' ? `${start}:${end}` : preset)
  params.set('granularity', granularity)
  params.set('scale', scale)
  if (theme === 'dark') params.set('theme', 'dark')
  return `/api/svg?${params.toString()}`
}

/**
 * Mantine's code block paints itself with --mantine-color-gray-0 (#f8f9fa),
 * which is within a hair of this site's page plane (#f9f9f7) -- so in light mode
 * the block had no visible edge at all. An explicit background and border, keyed
 * off the colour scheme, give it one in both modes.
 */
const CODE_SURFACE = {
  light: { background: '#f1f0e9', borderColor: '#e1e0d9' },
  dark: { background: '#232322', borderColor: '#3a3a38' },
} as const

const CODE_LAYOUT = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 11,
  border: '1px solid',
  // Mantine pads a block by --mantine-spacing-xs (10px); the extra room on the
  // right is the copy button's column, so the first line never runs underneath
  // it.
  padding: '10px 76px 10px 12px',
  // Long embed URLs used to overflow into a horizontal scrollbar, which is
  // ugly and hides most of the snippet. Wrapping shows all of it and leaves no
  // scrollbar to hide.
  overflowX: 'hidden',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  scrollbarWidth: 'none',
} as const

/**
 * Places the copy button on the code block's first line.
 *
 * The offset is derived, not eyeballed: the block's top padding is 10px, an
 * 11px line at Mantine's 1.55 line-height occupies 10..27px, and a compact-xs
 * button is 22px tall (--button-height-compact-xs) -- so top = 18.5 - 11 = 7.5
 * puts the button's centre on the first line's centre.
 */
const COPY_BUTTON_OFFSET = { top: 7.5, right: 8 } as const

export function EmbedPanel(props: Props) {
  const { packages, series } = props
  const scheme = useComputedColorScheme('light')
  const codeStyle = { ...CODE_LAYOUT, ...CODE_SURFACE[scheme] }
  const [origin] = useState(() =>
    typeof window === 'undefined'
      ? 'https://npmpulse.com'
      : window.location.origin
  )

  if (packages.length === 0) return null

  const disabled = packages.length > 8
  const lightPath = buildEmbedPath(props, 'light')
  const darkPath = buildEmbedPath(props, 'dark')
  const pagePath = `/#${packages.join(',')}`

  const markdown = `[![npm downloads](${origin}${lightPath})](${origin}${pagePath})`

  const html = [
    `<a href="${origin}${pagePath}">`,
    '  <picture>',
    `    <source media="(prefers-color-scheme: dark)" srcset="${origin}${darkPath}" />`,
    `    <img alt="npm downloads" src="${origin}${lightPath}" />`,
    '  </picture>',
    '</a>',
  ].join('\n')

  const download = (kind: 'svg' | 'png') => {
    const svg = renderChart(
      { series },
      {
        theme: 'light',
        granularity: props.granularity,
        scale: props.scale,
        title: packages.join(' vs '),
        unit: 'downloads',
      }
    )
    const name = `${packages.join('-').replace(/[^\w.-]+/g, '_')}-downloads`

    if (kind === 'svg') {
      triggerDownload(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`)
      return
    }

    // Rasterise through a canvas. The SVG is self-contained (no external
    // references), so it does not taint the canvas and toBlob stays allowed.
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1640
      canvas.height = 760
      const context = canvas.getContext('2d')
      if (!context) return
      context.fillStyle = '#fcfcfb'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `${name}.png`)
      }, 'image/png')
    }
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          Embed this chart
        </Text>
        <Group gap="xs">
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => download('svg')}
          >
            Download SVG
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => download('png')}
          >
            Download PNG
          </Button>
        </Group>
      </Group>

      {disabled ? (
        <Text size="xs" c="dimmed">
          Embeds support up to 8 packages.
        </Text>
      ) : (
        <Tabs defaultValue="markdown" variant="outline">
          <Tabs.List>
            <Tabs.Tab value="markdown">Markdown</Tabs.Tab>
            <Tabs.Tab value="html">HTML (dark mode aware)</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="markdown" pt="xs">
            <Snippet value={markdown} codeStyle={codeStyle} />
          </Tabs.Panel>
          <Tabs.Panel value="html" pt="xs">
            <Snippet value={html} codeStyle={codeStyle} />
          </Tabs.Panel>
        </Tabs>
      )}

      <Text size="xs" c="dimmed">
        Images are rendered on demand and cached at the edge. The embed endpoint
        is served by a Cloudflare Worker, so this only works on the Cloudflare
        deployment — a plain static host serves the site but not{' '}
        <code>/api/svg</code>.
      </Text>
    </Stack>
  )
}

function Snippet({
  value,
  codeStyle,
}: {
  value: string
  codeStyle: React.CSSProperties
}) {
  return (
    <Box style={{ position: 'relative' }}>
      <Code block style={codeStyle}>
        {value}
      </Code>
      <CopyButton value={value} timeout={1600}>
        {({ copied, copy }) => (
          <Button
            size="compact-xs"
            variant={copied ? 'filled' : 'default'}
            color={copied ? 'teal' : undefined}
            onClick={copy}
            style={{ position: 'absolute', ...COPY_BUTTON_OFFSET }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        )}
      </CopyButton>
    </Box>
  )
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
