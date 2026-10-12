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
 * The npmpulse mark, as the two path commands it is drawn from.
 *
 * One definition, used by the React lockup in the header and by the static page
 * layouts, which cannot render a React component without shipping an island to
 * draw a logo. The favicon and the social card carry their own copies because
 * neither can import: one is a file served before any build, the other is
 * rendered by Chrome from its own HTML.
 */

/** The shape's outline, drawn under the crest at low opacity. */
export const MARK_AREA =
  'M0 26 L5 23 L10 24 L15 18.5 L20 16 L25 10 L32 4.5 L32 32 L0 32 Z'

/** The line along the top of it. */
export const MARK_CREST = 'M0 26 L5 23 L10 24 L15 18.5 L20 16 L25 10 L32 4.5'

export const MARK_VIEWBOX = '0 0 32 32'
