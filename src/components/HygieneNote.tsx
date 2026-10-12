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

import { ActionIcon, Group, Text, Tooltip } from '@mantine/core'
import type { HygieneReport } from '../lib/aggregate.ts'

/**
 * Disclose exactly what the pipeline changed.
 *
 * The upstream data has real gaps, and a chart drawn from it would either show
 * false cliffs or quietly paper over them. Rather than pick one silently, the
 * trims and interpolations are counted and shown here.
 */
export function HygieneNote({ report }: { report: HygieneReport }) {
  const { trimmedHead, trimmedTail, filledGaps, firstRealDay, lastRealDay } =
    report
  if (!trimmedHead && !trimmedTail && !filledGaps) return null

  const parts: string[] = []
  if (trimmedHead > 0)
    parts.push(
      `${trimmedHead} leading day${trimmedHead === 1 ? '' : 's'} before npm has any record`
    )
  if (trimmedTail > 0)
    parts.push(
      `${trimmedTail} trailing day${trimmedTail === 1 ? '' : 's'} npm has not finalised`
    )
  if (filledGaps > 0)
    parts.push(
      `${filledGaps} interior missing day${filledGaps === 1 ? '' : 's'} interpolated`
    )

  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      {/*
        An ActionIcon, i.e. a real button, so the explanation is reachable by
        keyboard and reads out to assistive tech. It was a ThemeIcon, a plain
        span: the tooltip opened on hover only, and the copy beneath it told the
        reader to hover -- which a keyboard or touch reader cannot do.
      */}
      <Tooltip
        multiline
        w={280}
        label={
          <>
            npm reports 0 rather than omitting a day, for three different
            reasons: before a package was published, before npm finalised the
            last day or two, and for occasional days where the pipeline lost
            that day&apos;s logs. Leading and trailing gaps are removed; gaps
            bounded by real data on both sides are linearly interpolated. Raw
            values are never otherwise altered. Full range used: {firstRealDay}{' '}
            to {lastRealDay}.
          </>
        }
      >
        <ActionIcon
          size="xs"
          radius="xl"
          variant="light"
          color="gray"
          aria-label="How these counts were adjusted"
          style={{ cursor: 'help', flexShrink: 0 }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
            i
          </span>
        </ActionIcon>
      </Tooltip>
      <Text size="xs" c="dimmed">
        {parts.join(' · ')}.
      </Text>
    </Group>
  )
}
