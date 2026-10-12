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

import { Anchor, Group, Text } from '@mantine/core'

/**
 * The mark: the site's own chart — an area rising off a baseline — drawn in
 * `currentColor` so a header can drop it on either theme with nothing to swap.
 *
 * It bleeds to the edge of its box on three sides on purpose. The favicon clips
 * this exact path to its rounded tile, so the two are one drawing with and
 * without a frame, rather than two shapes that have to be kept in step.
 *
 * Decorative by default: next to the wordmark the name is already in the text,
 * and announcing it twice is worse than not at all.
 */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ display: 'block', flex: 'none' }}
    >
      <path
        d="M0 26 L5 23 L10 24 L15 18.5 L20 16 L25 10 L32 4.5 L32 32 L0 32 Z"
        fill="currentColor"
        opacity={0.3}
      />
      <path
        d="M0 26 L5 23 L10 24 L15 18.5 L20 16 L25 10 L32 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Mark and wordmark, linked to the bare origin — which is the default chart, so
 * the logo is a way back to the state the site opens on.
 *
 * The wordmark keeps the app's own type rather than a drawn one, and is
 * deliberately *not* a heading. The page's one `h1` describes what the site is
 * and is rendered by `index.astro` as real HTML, so it exists before this island
 * runs and for readers who never run it at all; a heading in here would be
 * absent exactly when it is most needed. The typography is the same `h3` step it
 * had, taken from Mantine's scale.
 */
export function LogoWithTitle() {
  return (
    <Anchor href="/" underline="never" style={{ color: 'inherit' }}>
      <Group gap={8} align="center" wrap="nowrap">
        <Logo />
        <Text
          component="span"
          fw={700}
          style={{
            fontSize: 'var(--type-wordmark)',
            lineHeight: 'var(--type-lh-heading)',
            letterSpacing: '-0.01em',
          }}
        >
          npmpulse
        </Text>
      </Group>
    </Anchor>
  )
}
