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
 * `www.npmpulse.com` -> `npmpulse.com`, permanently.
 *
 * Its own Worker rather than a branch in the site's Worker, because
 * `run_worker_first` matches request *paths* (`/api/*`), not hosts: it cannot
 * send only `www` traffic to the script, and a page request that the asset
 * handler serves never reaches the script at all. The alternative -- routing
 * every page view through the site Worker so it can inspect the hostname --
 * would make static views metered, which the deployment is deliberately built
 * to avoid. So `www` gets this three-line Worker (see `wrangler.www.jsonc`),
 * and the site Worker keeps serving the apex straight from assets.
 *
 * Two hosts serving identical pages is duplicate content; the canonical host is
 * the apex (`astro.config.mjs` sets `site` to it), and a 301 points search
 * engines and readers there.
 *
 * This module exports its default handler and NOTHING else -- workerd treats
 * every named export of an entry module as a candidate handler and refuses to
 * start the Worker if one is not callable.
 */

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url)
    url.hostname = url.hostname.replace(/^www\./, '')
    return Response.redirect(url.toString(), 301)
  },
}
