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

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * Renders `public/og.png`, the card a shared link unfurls into.
 *
 * The card is the favicon's tile scaled up: the same mark, on the same field,
 * bleeding into the bottom-right corner the way it bleeds inside the rounded
 * tile. Drawing it here rather than in a design tool keeps the mark in one
 * place -- if the path or the tagline changes, this is the file to change with
 * it, and `pnpm og` writes a new PNG.
 *
 * Chrome does the rendering because it is already how `render-svg.ts` produces
 * its PNGs, and because it sets text exactly as a browser will.
 */

/** Override on Linux/Windows, e.g. `CHROME=google-chrome pnpm og`. */
const CHROME =
  process.env.CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WIDTH = 1200
const HEIGHT = 630
const OUT = 'public/og.png'
const TMP = '/tmp/npmpulse-og'

/** The mark, at whatever size its box is. */
const mark = (line: number) => `
  <svg width="600" height="600" viewBox="0 0 32 32" aria-hidden="true"
       style="position:absolute;right:0;bottom:0">
    <path d="M0 26 L5 23 L10 24 L15 18.5 L20 16 L25 10 L32 4.5 L32 32 L0 32 Z" fill="#f0efec" opacity="0.26"/>
    <path d="M0 26 L5 23 L10 24 L15 18.5 L20 16 L25 10 L32 4.5" fill="none" stroke="#f0efec"
          stroke-width="${line}" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`

const html = `<body style="margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:#1a1b1e;overflow:hidden;position:relative;
  font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  ${mark(1.5)}
  <div style="position:absolute;left:76px;top:96px;width:520px">
    <div style="font-size:86px;font-weight:700;letter-spacing:-0.02em;color:#f0efec;line-height:1">npmpulse</div>
    <div style="margin-top:26px;font-size:32px;line-height:1.4;color:#c3c2b7">Any npm package's download history, every day, back to 2015.</div>
  </div>
  <div style="position:absolute;left:76px;bottom:76px;font-size:25px;color:#898781;letter-spacing:0.01em">npmpulse.com</div>
</body>`

mkdirSync(TMP, { recursive: true })
writeFileSync(`${TMP}/card.html`, html)

execFileSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=3000',
    `--screenshot=${OUT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `file://${TMP}/card.html`,
  ],
  { stdio: 'ignore' }
)

console.log(`wrote ${OUT} (${WIDTH}x${HEIGHT})`)
