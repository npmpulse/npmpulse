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
 * The packages the site publishes a page for.
 *
 * Curated rather than enumerated. A registry-wide sweep would generate hundreds
 * of thousands of pages that differ only by name, which is exactly the shape
 * search engines treat as scaled content abuse; what makes these pages worth
 * indexing is that each carries the full record since 2015, which no other
 * download-chart site can show. So the list is a judgement call: packages people
 * actually look up, grouped by what they are interchangeable with.
 *
 * `GROUPS` is what the compare pages pair from, which is why its members are
 * also the reason a package is on the list at all. Groups are capped at four on
 * purpose -- every group of n produces n(n-1)/2 pair pages, so five members
 * already means ten near-identical pages.
 */

export interface Group {
  /** Used in headings and to link siblings together. */
  label: string
  /** Unscoped names, so they can share one bulk request. */
  packages: readonly string[]
}

export const GROUPS: readonly Group[] = [
  { label: 'UI frameworks', packages: ['react', 'vue', 'svelte', 'angular'] },
  {
    label: 'lightweight UI libraries',
    packages: ['preact', 'solid-js', 'lit', 'alpinejs'],
  },
  { label: 'HTTP clients', packages: ['axios', 'got', 'undici', 'node-fetch'] },
  { label: 'meta-frameworks', packages: ['next', 'nuxt', 'astro', 'remix'] },
  { label: 'build tools', packages: ['vite', 'webpack', 'esbuild', 'rollup'] },
  { label: 'test runners', packages: ['jest', 'vitest', 'mocha', 'ava'] },
  {
    label: 'browser automation',
    packages: ['playwright', 'cypress', 'puppeteer', 'selenium-webdriver'],
  },
  {
    label: 'date libraries',
    packages: ['moment', 'dayjs', 'date-fns', 'luxon'],
  },
  { label: 'validation', packages: ['zod', 'yup', 'joi', 'ajv'] },
  {
    label: 'server frameworks',
    packages: ['express', 'fastify', 'koa', 'hapi'],
  },
  {
    label: 'state management',
    packages: ['redux', 'zustand', 'mobx', 'jotai'],
  },
  {
    label: 'CSS tooling',
    packages: ['tailwindcss', 'styled-components', 'sass', 'postcss'],
  },
  {
    label: 'utility belts',
    packages: ['lodash', 'underscore', 'ramda', 'rxjs'],
  },
  {
    label: 'CLI helpers',
    packages: ['commander', 'yargs', 'minimist', 'chalk'],
  },
  {
    label: 'linters and formatters',
    packages: ['eslint', 'prettier', 'stylelint'],
  },
  {
    label: 'database clients',
    packages: ['prisma', 'mongoose', 'sequelize', 'drizzle-orm'],
  },
]

/**
 * Tracked for its own page, but not part of any comparison -- either because it
 * has no real alternative or because adding it to a group would multiply that
 * group's pair pages for little search demand.
 */
export const SOLO_PACKAGES: readonly string[] = [
  'typescript',
  'react-dom',
  'tslib',
  'dotenv',
  'uuid',
  'nanoid',
  'immer',
  'clsx',
  'classnames',
  'semver',
  'glob',
  'chokidar',
  'tsx',
  'nodemon',
  'cross-env',
  'rimraf',
]

/** Every package the snapshot must contain, deduplicated and in a stable order. */
export const TRACKED_PACKAGES: readonly string[] = [
  ...new Set([...GROUPS.flatMap((g) => g.packages), ...SOLO_PACKAGES]),
]

/** The group a package belongs to, if any. */
export function groupOf(name: string): Group | undefined {
  return GROUPS.find((g) => g.packages.includes(name))
}
