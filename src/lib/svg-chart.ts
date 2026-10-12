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
 * Dependency-free SVG chart renderer.
 *
 * `@mantine/charts` is Recharts-based and therefore needs a DOM, so it cannot
 * produce an image inside a Cloudflare Worker. This module is the other half of
 * the embed path: a pure function from data to an SVG string, with no DOM and
 * no dependencies, so the same code draws the README image at the edge and the
 * "download as SVG" button in the browser.
 *
 * Deliberate choices, following the house data-viz rules:
 *  - 2px lines, hairline recessive grid, muted axis ink
 *  - a legend for >= 2 series, none for one (the title names it)
 *  - one y-axis only, never a second scale
 *  - values directly labelled at the line end: this is also the relief the
 *    palette validator requires for the light-mode slots below 3:1 contrast
 *  - all text is XML-escaped -- package names arrive from the query string and
 *    are untrusted input
 */

import { formatCompact, formatTick } from './format.ts'
import { type ChartTheme, type ThemeMode, themeFor } from './theme.ts'

export interface ChartPoint {
  /** Period start, 'YYYY-MM-DD'. */
  day: string
  value: number
}

export interface ChartSeries {
  name: string
  /**
   * This series' own points, ascending. Series are NOT required to cover the
   * same span: a package published in 2020 has no data for 2015, and the head
   * of each series is trimmed to where that package's records actually begin.
   */
  points: ChartPoint[]
}

export interface ChartInput {
  series: ChartSeries[]
}

export type ScaleKind = 'linear' | 'log'

export interface RenderOptions {
  width?: number
  height?: number
  theme?: ThemeMode
  granularity?: string
  title?: string
  /** Fill under the line. Defaults on for a single series, off for many. */
  area?: boolean
  scale?: ScaleKind
  /** Unit shown beside the title. */
  unit?: string
}

const PAD = { top: 16, right: 62, bottom: 30, left: 64 }
const TITLE_ROW = 24
const LEGEND_ROW = 22

/** XML escaping: package names are attacker-controlled. */
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** Round `rough` up to the nearest 1/2/5 x 10^n. */
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const exponent = Math.floor(Math.log10(rough))
  const fraction = rough / 10 ** exponent
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * 10 ** exponent
}

/** One decimal is plenty at these sizes and keeps the path data short. */
const n = (value: number): string => {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/* -------------------------------------------------------------- alignment */

/**
 * Every day any series covers, ascending.
 *
 * Series are lined up on this shared axis rather than by array position.
 * Position happens to work when every package spans the same days, but the
 * head of each series is trimmed to where that package's data begins -- so a
 * package published later has a shorter array, and indexing them all the same
 * way plots its first day at the chart's start instead of its own.
 */
export function chartAxis(series: readonly ChartSeries[]): string[] {
  const days = new Set<string>()
  for (const s of series) for (const point of s.points) days.add(point.day)
  return [...days].sort()
}

/** A series' values aligned to `axis`, null on days it does not cover. */
export function alignToAxis(
  series: ChartSeries,
  axis: readonly string[]
): Array<number | null> {
  const byDay = new Map(series.points.map((point) => [point.day, point.value]))
  return axis.map((day) => byDay.get(day) ?? null)
}

/**
 * Which axis positions to draw, when there are more than fit on screen.
 *
 * The set is chosen once and shared by every series, so all the lines are
 * sampled on the same days. Decimating each series independently gave each one
 * its own set of x positions -- the same misalignment the axis is here to
 * prevent, reintroduced downstream.
 *
 * A lone series keeps its peaks: each bucket contributes its minimum and its
 * maximum, so a spike survives even when it is one day in a hundred. With
 * several series that is not available, because per-series extrema are exactly
 * what produces differing positions; those fall back to an even stride.
 */
export function chooseAxisIndices(
  alignedValues: ReadonlyArray<ReadonlyArray<number | null>>,
  maxPoints: number
): number[] {
  const length = alignedValues[0]?.length ?? 0
  if (length <= maxPoints) return Array.from({ length }, (_, i) => i)
  if (length === 0) return []

  if (alignedValues.length === 1) {
    const values = alignedValues[0]
    const bucketSize = length / maxPoints
    const indices: number[] = []

    for (let bucket = 0; bucket < maxPoints; bucket++) {
      const from = Math.floor(bucket * bucketSize)
      const to = Math.min(length, Math.floor((bucket + 1) * bucketSize))
      if (to <= from) continue

      let minIndex = -1
      let maxIndex = -1
      for (let i = from; i < to; i++) {
        const value = values[i]
        if (value === null || !Number.isFinite(value)) continue
        if (minIndex === -1 || value < (values[minIndex] as number))
          minIndex = i
        if (maxIndex === -1 || value > (values[maxIndex] as number))
          maxIndex = i
      }
      if (minIndex === -1) continue

      const first = Math.min(minIndex, maxIndex)
      const second = Math.max(minIndex, maxIndex)
      indices.push(first)
      if (second !== first) indices.push(second)
    }
    return indices
  }

  const stride = (length - 1) / (maxPoints - 1)
  const indices: number[] = []
  for (let i = 0; i < maxPoints; i++) indices.push(Math.round(i * stride))
  return [...new Set(indices)]
}

/** A point on the plot, carrying the sample it came from. */
interface PlottedPoint {
  x: number
  y: number
  /** Index into the series' own aligned values. */
  index: number
  /** The value plotted here, so the end label needs no second lookup. */
  value: number
}

export function renderChart(
  input: ChartInput,
  options: RenderOptions = {}
): string {
  const {
    width = 820,
    height = 380,
    theme: mode = 'light',
    granularity = 'daily',
    title,
    unit,
    scale = 'linear',
    area,
  } = options

  const theme: ChartTheme = themeFor(mode)
  const multi = input.series.length > 1
  const withArea = area ?? !multi
  const showTitle = Boolean(title)
  const showLegend = multi

  const plotLeft = PAD.left
  const plotRight = width - PAD.right
  const plotTop =
    PAD.top + (showTitle ? TITLE_ROW : 0) + (showLegend ? LEGEND_ROW : 0)
  const plotBottom = height - PAD.bottom
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = Math.max(1, plotBottom - plotTop)

  // Direct end-labels are only useful when a line has room to end cleanly.
  const showEndLabels = plotRight - plotLeft > 220

  // ---- align, then thin --------------------------------------------------
  const wholeAxis = chartAxis(input.series)
  const wholeValues = input.series.map((s) => alignToAxis(s, wholeAxis))

  // The bucket count is one per pixel column, not two: min/max thinning already
  // keeps up to two points per bucket, so two buckets per pixel would retain
  // four samples per pixel and defeat the point.
  const maxPoints = Math.max(240, Math.floor(width - PAD.left - PAD.right))
  const keep = chooseAxisIndices(wholeValues, maxPoints)

  const dates = keep.map((index) => wholeAxis[index])
  const series = input.series.map((s, index) => ({
    name: s.name,
    values: keep.map((position) => wholeValues[index][position]),
  }))
  const count = dates.length

  // ---- domain ------------------------------------------------------------
  const finite: number[] = []
  for (const s of series)
    for (const v of s.values)
      if (v !== null && Number.isFinite(v) && v > 0) finite.push(v)

  const empty = count === 0 || series.length === 0 || finite.length === 0
  const maxValue = empty ? 1 : Math.max(...finite)
  const minPositive = empty ? 1 : Math.min(...finite)
  const useLog = scale === 'log' && !empty

  // Downloads span several orders of magnitude, so a log axis is often the
  // only way the early history is legible. On a log scale a value of 0 has no
  // position, so those points break the line instead of being drawn at -inf.
  const logMin = useLog ? 10 ** Math.floor(Math.log10(minPositive)) : 1
  const logMax = useLog ? 10 ** Math.ceil(Math.log10(maxValue)) : 1

  const step = niceStep(maxValue / 4 || 1)
  const yMaxLinear = Math.max(step, Math.ceil(maxValue / step) * step)

  const yAt = (value: number): number => {
    if (useLog) {
      const clamped = Math.max(value, logMin)
      const t =
        (Math.log10(clamped) - Math.log10(logMin)) /
        (Math.log10(logMax) - Math.log10(logMin))
      return plotBottom - t * plotHeight
    }
    return plotBottom - (value / yMaxLinear) * plotHeight
  }

  // ---- y ticks -----------------------------------------------------------
  const yTicks: number[] = []
  if (useLog) {
    const lo = Math.log10(logMin)
    const hi = Math.log10(logMax)
    for (let e = lo; e <= hi + 1e-9; e++) yTicks.push(10 ** e)
  } else {
    for (let v = 0; v <= yMaxLinear + step / 2; v += step) yTicks.push(v)
  }

  const xAt = (index: number): number =>
    count <= 1
      ? plotLeft + plotWidth / 2
      : plotLeft + (index / (count - 1)) * plotWidth

  const parts: string[] = []
  parts.push(
    `<rect width="${n(width)}" height="${n(height)}" fill="${theme.surface}"/>`
  )

  // ---- header ------------------------------------------------------------
  const unitNote = [unit, useLog ? 'log scale' : null]
    .filter(Boolean)
    .join(' · ')
  if (title) {
    parts.push(
      text(
        PAD.left,
        PAD.top + 13,
        escapeXml(title),
        theme.textPrimary,
        14,
        'start',
        600
      )
    )
  }
  if (unitNote) {
    parts.push(
      text(plotRight, PAD.top + 12, escapeXml(unitNote), theme.muted, 10, 'end')
    )
  }

  if (empty) {
    parts.push(
      text(
        width / 2,
        height / 2,
        'No download data for this range',
        theme.textSecondary,
        13,
        'middle'
      )
    )
    return svgWrap(width, height, theme, parts.join(''))
  }

  // ---- grid + y labels ---------------------------------------------------
  for (const value of yTicks) {
    const y = yAt(value)
    if (y < plotTop - 1 || y > plotBottom + 1) continue
    parts.push(
      `<line x1="${n(plotLeft)}" y1="${n(y)}" x2="${n(plotRight)}" y2="${n(y)}" ` +
        `stroke="${value === yTicks[0] ? theme.axis : theme.gridline}" stroke-width="1"/>`
    )
    parts.push(
      text(
        plotLeft - 10,
        y + 4,
        escapeXml(formatCompact(value)),
        theme.muted,
        11,
        'end'
      )
    )
  }

  // ---- x labels ----------------------------------------------------------
  const spansYears =
    dates.length > 1 && dates[0].slice(0, 4) !== dates[count - 1].slice(0, 4)
  const withYear =
    (granularity === 'daily' || granularity === 'weekly') && spansYears
  const targetTicks = Math.max(
    2,
    Math.min(8, Math.floor(plotWidth / (withYear ? 96 : 84)))
  )

  const indices: number[] = []
  if (count <= targetTicks) {
    for (let i = 0; i < count; i++) indices.push(i)
  } else {
    const stride = (count - 1) / (targetTicks - 1)
    for (let i = 0; i < targetTicks; i++) indices.push(Math.round(i * stride))
  }

  for (const index of indices) {
    parts.push(
      text(
        xAt(index),
        plotBottom + 18,
        escapeXml(formatTick(dates[index], granularity, withYear)),
        theme.muted,
        11,
        'middle'
      )
    )
  }

  // ---- series ------------------------------------------------------------
  const markers = count <= 40
  const endLabels: Array<{ y: number; label: string }> = []

  series.forEach((s, seriesIndex) => {
    const color = theme.series[seriesIndex % theme.series.length]

    const segments: PlottedPoint[][] = []
    let current: PlottedPoint[] = []
    s.values.forEach((value, index) => {
      // A null is either a day the series does not cover or a zero on a log
      // axis; both mean the line has nothing to draw there.
      if (value === null || !Number.isFinite(value) || (useLog && value <= 0)) {
        if (current.length) segments.push(current)
        current = []
        return
      }
      current.push({ x: xAt(index), y: yAt(value), index, value })
    })
    if (current.length) segments.push(current)

    if (withArea) {
      const baseline = n(plotBottom)
      for (const segment of segments) {
        if (segment.length < 2) continue
        const d = `M${n(segment[0].x)},${baseline} L${segment.map((p) => `${n(p.x)},${n(p.y)}`).join(' L')} L${n(segment[segment.length - 1].x)},${baseline} Z`
        parts.push(
          `<path d="${d}" fill="${color}" fill-opacity="0.13" stroke="none"/>`
        )
      }
    }

    for (const segment of segments) {
      if (segment.length === 1) {
        parts.push(
          `<circle cx="${n(segment[0].x)}" cy="${n(segment[0].y)}" r="3.5" fill="${color}"/>`
        )
        continue
      }
      parts.push(
        `<path d="M${segment.map((p) => `${n(p.x)},${n(p.y)}`).join(' L')}" fill="none" ` +
          `stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      )
      if (markers) {
        for (const p of segment)
          parts.push(
            `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="3" fill="${color}"/>`
          )
      }
    }

    // Collect the end label; it is placed after every series is drawn so the
    // labels can be pushed apart rather than overprinting each other.
    const last = segments.at(-1)?.at(-1)
    if (showEndLabels && last) {
      endLabels.push({ y: last.y, label: formatCompact(last.value) })
    }
  })

  // Direct labels at the line ends: identity that does not rely on colour, and
  // the relief the palette validator asks for on the light-mode slots. Two
  // series ending at similar heights would otherwise overprint, so the labels
  // are separated to a minimum spacing and the block is shifted to stay inside
  // the plot.
  if (showEndLabels && endLabels.length > 0) {
    const MIN_GAP = 13
    const ordered = [...endLabels].sort((a, b) => a.y - b.y)
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].y - ordered[i - 1].y < MIN_GAP)
        ordered[i].y = ordered[i - 1].y + MIN_GAP
    }
    const overflow = ordered[ordered.length - 1].y - (plotBottom - 2)
    if (overflow > 0) for (const item of ordered) item.y -= overflow
    const underflow = plotTop + 8 - ordered[0].y
    if (underflow > 0) for (const item of ordered) item.y += underflow
    for (const item of ordered) {
      parts.push(
        text(
          plotRight + 6,
          item.y + 4,
          escapeXml(item.label),
          theme.textSecondary,
          11,
          'start',
          600
        )
      )
    }
  }

  // ---- legend ------------------------------------------------------------
  if (showLegend) {
    const legendY = PAD.top + (showTitle ? TITLE_ROW : 0) + 14
    let cursor = PAD.left
    series.forEach((s, index) => {
      const color = theme.series[index % theme.series.length]
      parts.push(
        `<rect x="${n(cursor)}" y="${n(legendY - 8)}" width="9" height="9" rx="2" fill="${color}"/>`
      )
      parts.push(
        text(
          cursor + 14,
          legendY,
          escapeXml(s.name),
          theme.textSecondary,
          12,
          'start'
        )
      )
      cursor += 14 + s.name.length * 6.6 + 18
    })
  }

  return svgWrap(width, height, theme, parts.join(''))
}

function text(
  x: number,
  y: number,
  content: string,
  fill: string,
  size: number,
  anchor: 'start' | 'middle' | 'end',
  weight?: number
): string {
  return (
    `<text x="${n(x)}" y="${n(y)}" fill="${fill}" text-anchor="${anchor}" ` +
    `font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif" ` +
    `font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}>${content}</text>`
  )
}

function svgWrap(
  width: number,
  height: number,
  theme: ChartTheme,
  body: string
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" role="img" ` +
    `style="background:${theme.surface}">${body}</svg>`
  )
}
