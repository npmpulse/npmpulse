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
 * Share-intent URLs.
 *
 * Every network that can be reached without an API key or OAuth does it with a
 * plain GET, so a share button is a link and nothing more. Kept as pure
 * functions so the URLs can be asserted on rather than clicked at.
 *
 * Mastodon is deliberately absent: it has no central intent endpoint, so a
 * share link would have to guess the reader's instance. Every other target
 * listed here has one.
 */

export type ShareTarget =
  | 'x'
  | 'bluesky'
  | 'linkedin'
  | 'facebook'
  | 'reddit'
  | 'hackernews'

export interface ShareInput {
  /** The page to share, already carrying the chart's state in its query string. */
  url: string
  /** A short description; networks that accept one put it beside the link. */
  title: string
}

export interface ShareTargetSpec {
  id: ShareTarget
  /** Shown on the button. */
  label: string
  /** Why this target is worth offering here. */
  hint: string
  build: (input: ShareInput) => string
}

const enc = encodeURIComponent

/**
 * Ordered roughly by how much they matter for a developer-tool chart: X and
 * Bluesky carry the most developer conversation, Hacker News is the highest
 * value single link for a tool like this, then the wider networks.
 */
export const SHARE_TARGETS: readonly ShareTargetSpec[] = [
  {
    id: 'x',
    label: 'X',
    hint: 'Post to X',
    build: ({ url, title }) =>
      `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`,
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    hint: 'Post to Bluesky',
    // Bluesky's intent takes the whole post as text, link included.
    build: ({ url, title }) =>
      `https://bsky.app/intent/compose?text=${enc(`${title} ${url}`)}`,
  },
  {
    id: 'hackernews',
    label: 'Hacker News',
    hint: 'Submit to Hacker News',
    build: ({ url, title }) =>
      `https://news.ycombinator.com/submitlink?u=${enc(url)}&t=${enc(title)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    hint: 'Submit to Reddit',
    build: ({ url, title }) =>
      `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    hint: 'Share to LinkedIn',
    // LinkedIn ignores any text passed alongside; it previews the page itself.
    build: ({ url }) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hint: 'Share to Facebook',
    build: ({ url }) =>
      `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
]

export const SHARE_TARGET_IDS: readonly ShareTarget[] = SHARE_TARGETS.map(
  (t) => t.id
)
