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
  Button,
  Group,
  SegmentedControl,
  Stack,
  TagsInput,
  Text,
  Tooltip,
} from '@mantine/core'
import type { Granularity } from '../lib/aggregate.ts'
import { normalizePackages } from '../lib/npm-api.ts'
import type { ScaleKind } from './DownloadChart.tsx'

interface PackageTagsProps {
  value: string[]
  loading: boolean
  error: string | null
  onChange: (value: string[]) => void
  onRefresh: () => void
}

/**
 * Package selection as removable pills rather than a comma-separated string:
 * each package becomes an object you can add or cancel directly.
 *
 * There is no submit step -- `onChange` fires on add and on remove, and the
 * chart follows. The only action the tags cannot express is discarding the
 * local cache, so the button is a re-fetch. Its label is short and therefore
 * slightly ambiguous on its own ("Refresh" reads as "reload the page" too), so
 * the tooltip carries the precise wording.
 */
export function PackageTags({
  value,
  loading,
  error,
  onChange,
  onRefresh,
}: PackageTagsProps) {
  return (
    <Stack gap={6}>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TagsInput
          flex={1}
          size="md"
          label="npm packages"
          value={value}
          // Normalise on the way in: a pasted "react,vue,svelte" can land as a
          // single pill, and a name containing a separator would then be sent
          // as one package while the API reads it as three.
          onChange={(next) => onChange(normalizePackages(next).slice(0, 8))}
          // Split on space as well as comma -- neither can appear in a name.
          splitChars={[',', ' ']}
          maxTags={8}
          clearable
          placeholder={
            value.length === 0 ? 'Add a package, e.g. react' : 'Add another…'
          }
          aria-label="npm package names"
          data={[]}
          error={error}
        />
        <Tooltip
          label="Fetch again from npm, ignoring the local cache"
          withArrow
        >
          {/*
            A Button, not an ActionIcon: ActionIcon has its own smaller size
            scale (--ai-size-md is 28px) while Button and Input share one
            (--button-height-md and --input-height-md are both 42px), so a
            Button lines up with the field beside it and an ActionIcon does not.
          */}
          <Button size="md" color="dark" loading={loading} onClick={onRefresh}>
            Refresh
          </Button>
        </Tooltip>
      </Group>
      <Text size="xs" c="dimmed">
        Add up to 8 packages to compare them on one chart.
      </Text>
    </Stack>
  )
}

interface GranularityToggleProps {
  /** Which to offer; omitted means all four. */
  granularities?: readonly Granularity[]
  value: Granularity
  onChange: (value: Granularity) => void
}

/** The four in the app; the generated pages offer the two their data supports. */
const ALL_GRANULARITIES: Array<{ label: string; value: Granularity }> = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
]

export function GranularityToggle({
  value,
  onChange,
  granularities,
}: GranularityToggleProps) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">
        Granularity
      </Text>
      <SegmentedControl
        size="xs"
        value={value}
        onChange={(next) => onChange(next as Granularity)}
        data={
          granularities
            ? ALL_GRANULARITIES.filter((option) =>
                granularities.includes(option.value)
              )
            : ALL_GRANULARITIES
        }
      />
    </Stack>
  )
}

interface ScaleToggleProps {
  value: ScaleKind
  onChange: (value: ScaleKind) => void
}

export function ScaleToggle({ value, onChange }: ScaleToggleProps) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">
        Scale
      </Text>
      <SegmentedControl
        size="xs"
        value={value}
        onChange={(next) => onChange(next as ScaleKind)}
        data={[
          { label: 'Linear', value: 'linear' },
          { label: 'Log', value: 'log' },
        ]}
      />
    </Stack>
  )
}
