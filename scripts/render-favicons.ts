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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Renders the favicon set from public/favicon.svg, the one canonical drawing
 * of the mark (it is Logo.tsx's path, clipped to a rounded tile with a rim).
 *
 * The output follows the realfavicongenerator.net layout:
 *
 *   public/favicon.svg                 master, unchanged
 *   public/favicon-96x96.png           modern-browser PNG fallback
 *   public/favicon.ico                 legacy multi-size (16/32/48)
 *   public/apple-touch-icon.png        180x180 square -- iOS applies its own
 *                                      mask, so no rounded corners or rim here
 *   public/web-app-manifest-192x192.png  maskable PWA icons
 *   public/web-app-manifest-512x512.png
 *
 * public/site.webmanifest is hand-written next to these and references the
 * two manifest PNGs.
 *
 * Chrome rasterises, as in render-og.ts/render-svg.ts, so the PNGs match what
 * a browser draws; ImageMagick packs the .ico. Run with `pnpm favicons` after
 * changing the mark.
 */

const PUBLIC = 'public'
const scratch = mkdtempSync(join(tmpdir(), 'npmpulse-favicons-'))

/** Override on Linux/Windows, e.g. `CHROME=google-chrome pnpm favicons`. */
const CHROME =
  process.env.CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const tile = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8')

/*
  The square variant: the tile's contents (field + mark) without the rounded
  clip and rim. iOS rounds the apple-touch-icon itself, and launchers mask
  maskable icons, so those get the full square instead.
*/
const inner = tile.match(/<g clip-path="url\(#tile\)">([\s\S]*?)<\/g>/)?.[1]
if (!inner) {
  throw new Error(
    'favicon.svg no longer has the <g clip-path="url(#tile)"> group this script expects'
  )
}
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${inner}</svg>\n`

/** Rasterise an SVG string to an exact-size PNG on a transparent canvas. */
function raster(svg: string, size: number, png: string) {
  // Chrome sizes a viewBox-only SVG document at 300x150; explicit dimensions
  // pin it to the window, which is the exact output size.
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
  const inSvg = join(scratch, `in-${size}.svg`)
  writeFileSync(inSvg, sized)
  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--screenshot=${png}`,
      `--window-size=${size},${size}`,
      `file://${inSvg}`,
    ],
    { stdio: 'ignore' }
  )
}

// Rounded tile with alpha in the corners: browsers.
raster(tile, 96, join(PUBLIC, 'favicon-96x96.png'))
const icoPngs = [16, 32, 48].map((size) => {
  const png = join(scratch, `favicon-${size}.png`)
  raster(tile, size, png)
  return png
})
execFileSync('magick', [...icoPngs, join(PUBLIC, 'favicon.ico')])

// Full square: the apple-touch-icon and maskable PWA icons.
raster(square, 180, join(PUBLIC, 'apple-touch-icon.png'))
raster(square, 192, join(PUBLIC, 'web-app-manifest-192x192.png'))
raster(square, 512, join(PUBLIC, 'web-app-manifest-512x512.png'))

console.log('favicons rendered to public/')
