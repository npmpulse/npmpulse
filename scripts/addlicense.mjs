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

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { addLicense, MissingLicenseError } from 'addlicense-ts'

const check = process.argv.includes('-c')

/** Where the code lives. */
const PATTERNS = ['src', 'worker', 'scripts']

/** The header template, and the file a copy of the project is pointed at. */
const LICENSE_FILE = 'LICENSE'

/**
 * `licenseFile` points at the LICENSE file, which is used verbatim as the
 * header template -- so the holder and the year are written down exactly once.
 * `holder`/`year` below only matter for a template that still has `{{Holder}}`
 * or `{{Year}}` in it; ours is already rendered.
 *
 * @type {import('addlicense-ts').AddLicenseOptions}
 */
const options = {
  patterns: PATTERNS,
  holder: 'Xiao Hanyu (https://xiaohanyu.me)',
  license: 'mit',
  year: '2026\u2013Present',
  verbose: false,
  check,
  spdx: 0, // SpdxMode.Off
  ignore: [],
  skip: [],
  licenseFile: LICENSE_FILE,
}

/**
 * addlicense-ts has no comment style for `.astro`, so those files are stamped
 * here instead -- the pass below is the only thing that covers them. The header
 * goes *inside* the frontmatter fence, where it stays a JS comment: an HTML
 * comment above the fence would be emitted into every page's markup.
 */
const FRONTMATTER_EXTENSIONS = new Set(['.astro'])

/** The same shape addlicense-ts writes, so a header reads the same either way. */
function commentBlock(licenseText) {
  // addlicense-ts splits the raw file, so the single trailing newline becomes a
  // blank ` *` line before ` */`. Normalising to one newline keeps a header from
  // this pass byte-identical to one from that one.
  const body = licenseText
    .replace(/\n+$/, '\n')
    .split('\n')
    .map((line) => ` * ${line}`.trimEnd())
    .join('\n')
  return `/**\n${body}\n */\n`
}

/** addlicense-ts's own test for "a header is already here". */
function hasHeader(source) {
  return /(?:^|\n)\s*(?:\/\/|\/\*|#|\*)?\s*copyright\s+(?:\(c\)|\u00a9|\d)/i.test(
    source.slice(0, 1000)
  )
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** Stamps the files addlicense-ts cannot see, or lists them in check mode. */
async function stampFrontmatterFiles() {
  const header = commentBlock(await readFile(LICENSE_FILE, 'utf8'))
  const missing = []
  let stamped = 0
  let skipped = 0

  for (const dir of PATTERNS) {
    for await (const file of walk(dir)) {
      if (!FRONTMATTER_EXTENSIONS.has(path.extname(file))) continue

      const source = await readFile(file, 'utf8')
      if (hasHeader(source)) {
        skipped++
        continue
      }
      if (check) {
        missing.push(file)
        continue
      }
      if (!source.startsWith('---\n')) {
        throw new Error(`${file}: no frontmatter fence on the first line`)
      }
      await writeFile(file, `---\n${header}${source.slice('---\n'.length)}`)
      stamped++
    }
  }

  return { missing, stamped, skipped }
}

try {
  let result = { modified: 0, skipped: 0 }
  let upstreamMissing = 0

  try {
    result = await addLicense(options)
  } catch (error) {
    // Both passes run before anything is reported, so a new file of each kind
    // is named in the same run. addlicense-ts has already printed its own list.
    if (!(error instanceof MissingLicenseError)) throw error
    upstreamMissing = error.missingFiles.length
  }

  const extra = await stampFrontmatterFiles()
  for (const file of extra.missing) console.log(file)

  const missing = upstreamMissing + extra.missing.length
  if (missing > 0) {
    console.error(`missing license header in ${missing} file(s)`)
    process.exit(1)
  }

  if (check) {
    // `modified` stays 0 in check mode -- it counts writes, and there are none.
    console.log('license: every checked file carries a header')
  } else {
    console.log(
      `license: ${result.modified + extra.stamped} file(s) got a header, ` +
        `${result.skipped + extra.skipped} already had one`
    )
  }
} catch (error) {
  if (error instanceof Error) console.error(error.message)
  process.exit(1)
}
