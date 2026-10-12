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

import { Group, Table, Text } from '@mantine/core'
import type { Granularity } from '../lib/aggregate.ts'
import { formatCompact, formatFull } from '../lib/format.ts'
import type { ChartTheme } from '../lib/theme.ts'

export interface PackageStat {
  name: string
  /** Sum over the whole visible range, so packages are comparable. */
  total: number
  latest: number
  peak: number
  periods: number
}

interface Props {
  stats: PackageStat[]
  /** Supplies both the categorical series colours and the recessive track colour. */
  theme: ChartTheme
  granularity: Granularity
  requests: number | null
  fromCache: boolean
}

/** Right-aligned figures with tabular numerals so columns line up. */
const NUMERIC = { fontVariantNumeric: 'tabular-nums' } as const

const BAR_COLUMN = 180
const NUMERIC_COLUMN = 104

/**
 * Per-package figures, one row each.
 *
 * The table spans the container rather than sitting in a narrow column. It was
 * previously capped at 640px, which left a wide band of empty space beside a
 * full-width chart and read as a layout mistake. The space it now occupies
 * carries the relative-share bar, which is the one comparison the numbers alone
 * make you do in your head.
 *
 * One table serves one package and eight. An earlier version swapped in tiles
 * for the single-package case, which meant two layouts to keep in step and,
 * worse, that multi-package silently showed only the first package's numbers.
 */
export function StatsPanel({
  stats,
  theme,
  granularity,
  requests,
  fromCache,
}: Props) {
  if (stats.length === 0) return null

  // A single row has nothing to be relative to, so the bar column is dropped
  // and the remaining columns take the width.
  const showBars = stats.length > 1
  const largest = Math.max(...stats.map((stat) => stat.total), 1)

  const footer = [
    `${formatFull(stats[0].periods)} ${granularity} periods`,
    requests !== null
      ? `${requests} request${requests === 1 ? '' : 's'}${fromCache ? ' · cached' : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {/*
        A scroll container, because the table's columns are fixed widths that
        add up to more than a phone is wide (180 + 104 + 104 + 104). Without it
        the table pushed the whole document wider than the viewport, so every
        page scrolled sideways on a phone. `minWidth` keeps the columns from
        being crushed once the container is the scroll boundary.
      */}
      <div style={{ overflowX: 'auto' }}>
        <Table
          horizontalSpacing="md"
          verticalSpacing={6}
          highlightOnHover
          style={{ tableLayout: 'fixed', minWidth: 520 }}
        >
          <Table.Thead>
            <Table.Tr>
              {/*
              With a fixed layout the browser hands any width the explicit
              column widths do not claim to the columns that have none. When the
              bar is present it absorbs that surplus, which is what makes the
              bars long enough to read. With a single package there is no bar, so
              leaving Package unconstrained lets it absorb the surplus instead --
              otherwise the surplus is split across the numeric columns and
              scatters the figures back to opposite edges.
            */}
              <Table.Th w={showBars ? BAR_COLUMN : undefined}>Package</Table.Th>
              {showBars && <Table.Th aria-label="Relative total" />}
              <Table.Th ta="right" w={NUMERIC_COLUMN}>
                Total
              </Table.Th>
              <Table.Th ta="right" w={NUMERIC_COLUMN}>
                Latest
              </Table.Th>
              <Table.Th ta="right" w={NUMERIC_COLUMN}>
                Peak
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {stats.map((stat, index) => {
              const color = theme.series[index % theme.series.length]
              const share = largest > 0 ? (stat.total / largest) * 100 : 0

              return (
                <Table.Tr key={stat.name}>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <span
                        aria-hidden
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <Text size="sm" truncate>
                        {stat.name}
                      </Text>
                    </Group>
                  </Table.Td>

                  {showBars && (
                    <Table.Td>
                      {/*
                      The bar restates the Total column proportionally, so it is
                      hidden from assistive tech — the figures beside it carry
                      the data on their own.
                    */}
                      <div
                        aria-hidden
                        title={`${share.toFixed(1)}% of the largest total`}
                        style={{
                          height: 8,
                          borderRadius: 2,
                          background: theme.gridline,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${share}%`,
                            height: '100%',
                            background: color,
                          }}
                        />
                      </div>
                    </Table.Td>
                  )}

                  <Table.Td ta="right">
                    <Text size="sm" fw={600} style={NUMERIC}>
                      {formatCompact(stat.total)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" style={NUMERIC}>
                      {formatCompact(stat.latest)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" style={NUMERIC}>
                      {formatCompact(stat.peak)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </div>
      <Text size="xs" c="dimmed" mt={6}>
        {footer}
      </Text>
    </>
  )
}
