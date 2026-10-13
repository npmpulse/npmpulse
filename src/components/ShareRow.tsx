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

import { Button, CopyButton, Group, Stack, Text, Tooltip } from '@mantine/core'
import { SHARE_TARGETS } from '../lib/share.ts'

interface Props {
  /** The page URL, which already encodes the packages, range and scale. */
  url: string
  title: string
  /** Hidden entirely when there is no chart to share yet. */
  disabled?: boolean
}

/**
 * A share row rather than the platform-specific widgets.
 *
 * Each target is a plain link to a public share-intent endpoint, so nothing is
 * loaded from those networks until someone actually clicks. Opening in a sized
 * popup keeps the reader's chart on screen behind the composer.
 */
export function ShareRow({ url, title, disabled = false }: Props) {
  const open = (target: string) => (event: React.MouseEvent) => {
    event.preventDefault()
    window.open(target, 'share', 'width=600,height=560,noopener,noreferrer')
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          Share this chart
        </Text>
        <CopyButton value={url} timeout={1600}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy link'} withArrow>
              <Button
                size="compact-xs"
                variant={copied ? 'filled' : 'default'}
                color={copied ? 'teal' : undefined}
                onClick={copy}
                disabled={disabled}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Group gap={6}>
        {SHARE_TARGETS.map((target) => (
          <Tooltip
            key={target.id}
            label={target.hint}
            withArrow
            openDelay={300}
          >
            <Button
              component="a"
              href={target.build({ url, title })}
              onClick={open(target.build({ url, title }))}
              size="compact-xs"
              variant="default"
              disabled={disabled}
            >
              {target.label}
            </Button>
          </Tooltip>
        ))}
      </Group>

      <Text size="xs" c="dimmed">
        The link carries the packages, range and scale, so it opens on the same
        chart. Nothing is loaded from these networks until you click one.
      </Text>
    </Stack>
  )
}
