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
 * npm downloads API client with chunked range fetching.
 *
 * The public API caps range queries: 549 days for a single package, 365 days
 * for a multi-package (bulk) query, and 128 packages per bulk query. Worse, an
 * over-long single-package range is *silently truncated* to its last 549 days
 * rather than erroring. So we split the requested window into legal chunks and
 * stitch them back together -- that stitching is what lets npmpulse show the
 * full history back to 2015-01-10, which the existing tools cannot do.
 *
 * Pure module: fetch only, no DOM, no Node APIs. Shared verbatim by the browser
 * and by the Cloudflare Worker that renders embed images.
 */

/** First day npm has download records for. */
export const DATA_START = '2015-01-10'
export const API_BASE = 'https://api.npmjs.org/downloads'

/** The API's single-package cap is 549 days inclusive; keep a margin. */
export const SINGLE_CHUNK_DAYS = 540
/** Bulk (multi-package) queries are capped at 365 days. */
export const BULK_CHUNK_DAYS = 365
export const MAX_PACKAGES = 128

/** How many chunk requests to keep in flight at once. */
const CONCURRENCY = 6

/**
 * The public API rate-limits. A 429 is normal under sustained load (eight
 * chunks per full-history request, several users at once) and is worth waiting
 * out rather than surfacing as a failed chart.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 600

export interface DayPoint {
  day: string
  downloads: number
}

/** Package name -> its daily points, ascending by day. */
export type SeriesMap = Record<string, DayPoint[]>

export type NpmApiErrorCode =
  | 'not-found'
  | 'truncated'
  | 'http'
  | 'network'
  | 'bad-request'

export class NpmApiError extends Error {
  readonly code: NpmApiErrorCode
  readonly status?: number

  constructor(code: NpmApiErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'NpmApiError'
    this.code = code
    this.status = status
  }
}

/* ------------------------------------------------------------------ dates */
/* All dates are 'YYYY-MM-DD' strings handled in UTC, so a user's timezone
   can never shift a day boundary and corrupt a chunk split.               */

const MS_PER_DAY = 86_400_000

export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(day: string, delta: number): string {
  return toDay(new Date(parseDay(day).getTime() + delta * MS_PER_DAY))
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function dayDiff(a: string, b: string): number {
  return Math.round(
    (parseDay(b).getTime() - parseDay(a).getTime()) / MS_PER_DAY
  )
}

export function todayISO(now: Date = new Date()): string {
  return toDay(now)
}

/** npm has no data before DATA_START, so never ask for it. */
export function clampStart(day: string): string {
  return day < DATA_START ? DATA_START : day
}

export function isValidDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = parseDay(value)
  if (Number.isNaN(parsed.getTime())) return false
  // The day field is only range-checked to 31, so `2026-02-30` parses happily
  // and lands on 2 March. Round-tripping is what catches a day that is not one.
  return toDay(parsed) === value
}

/* ---------------------------------------------------------------- chunking */

export interface Chunk {
  start: string
  end: string
}

/**
 * Split [start, end] into windows of at most `chunkDays` days, inclusive of
 * both endpoints. A 549-day window means `dayDiff(start, end) === 548`.
 */
export function buildChunks(
  start: string,
  end: string,
  chunkDays: number
): Chunk[] {
  const chunks: Chunk[] = []
  let cursor = start
  while (cursor <= end) {
    const candidate = addDays(cursor, chunkDays - 1)
    const chunkEnd = candidate < end ? candidate : end
    chunks.push({ start: cursor, end: chunkEnd })
    cursor = addDays(chunkEnd, 1)
  }
  return chunks
}

/**
 * Split, trim and de-duplicate a package list.
 *
 * A comma or any whitespace is always a separator the caller meant, never part
 * of a name -- no npm package can contain either. Splitting here is what keeps
 * the client's package count equal to the number of comma-separated segments
 * the API will see in the URL, and that count is what decides single-package
 * (549-day) versus bulk (365-day) chunking. When the two disagree the client
 * sends a 549-day window the API judges as a bulk query and rejects with a 400.
 *
 * The UI normalises too, so in practice this is defence in depth.
 */
export function normalizePackages(packages: readonly string[]): string[] {
  return [
    ...new Set(
      packages
        .flatMap((name) => name.split(/[,\s]+/))
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ]
}

/** Chunk size the API will accept for this shape of request. */
export function chunkDaysFor(packageCount: number): number {
  return packageCount <= 1 ? SINGLE_CHUNK_DAYS : BULK_CHUNK_DAYS
}

export interface RequestJob {
  /** Packages this request stream covers. */
  names: string[]
  /** Maximum days per request on this stream. */
  chunkDays: number
}

/**
 * Split a comparison into request streams.
 *
 * The bulk endpoint refuses scoped packages outright -- the API answers
 * "scoped packages are not currently supported in bulk lookups" for every
 * encoding of `@scope/name`, so this is an API limitation and not something a
 * different URL would fix. Scoped names therefore each get their own
 * single-package stream, while unscoped ones share bulk requests. Comparing a
 * scoped package against an unscoped one costs a few extra requests, but it
 * works, and each stream keeps its own legal chunk size.
 */
export function planRequests(names: readonly string[]): RequestJob[] {
  const unscoped = names.filter((name) => !name.startsWith('@'))
  const scoped = names.filter((name) => name.startsWith('@'))

  const jobs: RequestJob[] = []
  if (unscoped.length > 0) {
    jobs.push({ names: unscoped, chunkDays: chunkDaysFor(unscoped.length) })
  }
  for (const name of scoped) {
    jobs.push({ names: [name], chunkDays: SINGLE_CHUNK_DAYS })
  }
  return jobs
}

/* ------------------------------------------------------------------ fetch */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

/** Honour `Retry-After` when the API sends it, else back off exponentially. */
function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  response?: Response
): number {
  const header = response?.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1000, 10_000)
  }
  // Jitter keeps parallel chunks from retrying in lockstep.
  const backoff = baseDelayMs * 3 ** attempt
  return Math.min(backoff + Math.random() * 250, 12_000)
}

/**
 * Fetch with retries on the statuses that are worth retrying. Aborts are never
 * retried: they mean the caller no longer wants the answer.
 */
async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  baseDelayMs: number,
  maxAttempts = MAX_ATTEMPTS
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response
    try {
      response = await fetchImpl(url, { signal })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      lastError = error
      if (attempt === maxAttempts - 1) throw error
      await sleep(retryDelayMs(attempt, baseDelayMs), signal)
      continue
    }

    if (
      !RETRYABLE_STATUSES.has(response.status) ||
      attempt === maxAttempts - 1
    ) {
      return response
    }

    lastError = new NpmApiError(
      'http',
      `npm downloads API returned ${response.status}.`,
      response.status
    )
    await sleep(retryDelayMs(attempt, baseDelayMs, response), signal)
  }

  throw lastError instanceof Error
    ? lastError
    : new NpmApiError('network', 'Request failed.')
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = next++
        if (index >= items.length) return
        results[index] = await fn(items[index], index)
      }
    }
  )

  await Promise.all(workers)
  return results
}

/**
 * Normalise the two response shapes the API uses: a single-package range query
 * returns `{package, downloads}`, a bulk query returns `{[pkg]: {downloads}}`.
 */
function normalizeChunk(json: unknown, packages: readonly string[]): SeriesMap {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const record = json as Record<string, unknown>
    if (typeof record.error === 'string') {
      throw new NpmApiError('bad-request', record.error)
    }
    if (Array.isArray(record.downloads) && typeof record.package === 'string') {
      return { [record.package]: record.downloads as DayPoint[] }
    }
    const out: SeriesMap = {}
    for (const name of packages) {
      const entry = record[name]
      if (
        entry &&
        typeof entry === 'object' &&
        Array.isArray((entry as DayPoint[] & { downloads?: unknown }).downloads)
      ) {
        out[name] = (entry as { downloads: DayPoint[] }).downloads
      }
    }
    return out
  }
  throw new NpmApiError(
    'http',
    'Unexpected response shape from the npm downloads API.'
  )
}

export interface FetchDownloadsOptions {
  /** Inclusive lower bound; clamped to DATA_START. */
  start?: string
  /** Inclusive upper bound; defaults to today (UTC). */
  end?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  /** Injected for tests / deterministic builds. */
  now?: Date
  /**
   * Base for the exponential retry backoff. Defaults to 600ms; tests set it to
   * 0 so a failure path does not spend twelve seconds before asserting.
   */
  retryBaseDelayMs?: number
}

export interface FetchDownloadsResult {
  start: string
  end: string
  series: SeriesMap
  /** Number of upstream requests made; lets callers and tests assert on chunking. */
  requests: number
}

/**
 * Fetch daily downloads for one or more packages across an arbitrary window,
 * transparently chunked around the API's range limits.
 */
export async function fetchDownloads(
  packages: readonly string[],
  options: FetchDownloadsOptions = {}
): Promise<FetchDownloadsResult> {
  const names = normalizePackages(packages)

  if (names.length === 0) {
    throw new NpmApiError('bad-request', 'No package names given.')
  }
  if (names.length > MAX_PACKAGES) {
    throw new NpmApiError(
      'bad-request',
      `At most ${MAX_PACKAGES} packages can be compared at once.`
    )
  }

  const start = clampStart(options.start ?? DATA_START)
  const end = options.end ?? todayISO(options.now ?? new Date())

  if (!isValidDay(start) || !isValidDay(end)) {
    throw new NpmApiError(
      'bad-request',
      `Invalid date range: ${start} .. ${end}`
    )
  }
  if (start > end) {
    throw new NpmApiError(
      'bad-request',
      `Start date ${start} is after end date ${end}.`
    )
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const retryBaseDelayMs = options.retryBaseDelayMs ?? BASE_DELAY_MS

  // Plan every request up front: each stream carries its own chunk size, and
  // scoped packages cannot share a stream with anything.
  const work: Array<{ names: string[]; chunk: Chunk }> = []
  for (const job of planRequests(names)) {
    for (const chunk of buildChunks(start, end, job.chunkDays)) {
      work.push({ names: job.names, chunk })
    }
  }

  const parts = await mapLimit(
    work,
    CONCURRENCY,
    async ({ names: jobNames, chunk }) => {
      // Encode each name, then join with a *literal* comma: the separator must
      // survive as a separator. Encoding the joined string escapes the commas
      // too, which only works because the API happens to decode %2C back.
      const query = jobNames.map((name) => encodeURIComponent(name)).join(',')
      const url = `${API_BASE}/range/${chunk.start}:${chunk.end}/${query}`

      let response: Response
      try {
        response = await fetchWithRetry(
          url,
          fetchImpl,
          options.signal,
          retryBaseDelayMs
        )
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        throw new NpmApiError(
          'network',
          `Could not reach the npm downloads API: ${(error as Error).message}`
        )
      }

      if (response.status === 404) {
        // The API's own body is a JSON blob naming the package; a plain sentence
        // reads better in a chart placeholder and does not leak the raw payload.
        const missing =
          jobNames.length === 1
            ? `"${jobNames[0]}"`
            : jobNames.map((n) => `"${n}"`).join(', ')
        throw new NpmApiError(
          'not-found',
          `Package not found on npm: ${missing}`,
          404
        )
      }
      if (response.status === 429) {
        throw new NpmApiError(
          'http',
          'npm is rate-limiting requests right now. Wait a moment and try again.',
          429
        )
      }
      if (!response.ok) {
        // The API explains itself in the body ("exceeded max days of 365 for bulk
        // query", "scoped packages are not currently supported in bulk lookups").
        // Surfacing that beats a bare status code, which tells the caller nothing
        // about what to change.
        const body = await response.text().catch(() => '')
        let message = `npm downloads API returned ${response.status}.`
        try {
          const parsed = JSON.parse(body) as { error?: unknown }
          if (typeof parsed?.error === 'string') message = parsed.error
        } catch {
          /* not JSON -- keep the status-code message */
        }
        throw new NpmApiError('http', message, response.status)
      }

      const series = normalizeChunk(await response.json(), jobNames)

      // Guard against silent truncation: if the API shortened our window it
      // means we mis-sized a chunk, and stitching would produce a chart with a
      // phantom gap rather than an error. Fail loudly instead.
      for (const [name, points] of Object.entries(series)) {
        if (points.length > 0 && points[0].day > chunk.start) {
          throw new NpmApiError(
            'truncated',
            `The npm API returned ${name} starting ${points[0].day} instead of ${chunk.start}; ` +
              'the requested window exceeds what the API allows for one request.'
          )
        }
      }

      return series
    }
  )

  // Merge chunks into one ascending, de-duplicated series per package. One map
  // per name is created up front -- including for a package that reported
  // nothing -- so iterating `byDay` covers every request and emits the packages
  // in the order they were asked for.
  const byDay = new Map<string, Map<string, DayPoint>>()
  for (const name of names) byDay.set(name, new Map())

  for (const part of parts) {
    for (const [name, points] of Object.entries(part)) {
      const target = byDay.get(name)
      if (!target) continue
      for (const point of points) target.set(point.day, point)
    }
  }

  const merged: SeriesMap = {}
  for (const [name, days] of byDay) {
    merged[name] = [...days.values()].sort((a, b) =>
      a.day < b.day ? -1 : a.day > b.day ? 1 : 0
    )
  }

  return { start, end, series: merged, requests: work.length }
}

/** True when every requested package came back with at least one data point. */
export function missingPackages(series: SeriesMap): string[] {
  return Object.entries(series)
    .filter(([, points]) => points.length === 0)
    .map(([name]) => name)
}
