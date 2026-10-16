// Server-only. Shared fetch for the NHL's public API (api-web.nhle.com).
// The per-team endpoints (schedule, roster) need one request per team, and
// firing all 32 at once gets rate-limited (429) intermittently - confirmed
// in prod logs on 2026-10-16: /api/schedule/range and /api/headshots both
// 502'd together while their Next fetch cache was cold, and refreshing the
// page just fired the same burst again. One failed team used to fail the
// whole schedule, with no retry.

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 600;
// A single wait longer than this isn't worth holding a request open for.
const MAX_BACKOFF_MS = 8000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** GET + JSON with retry/backoff on 429 and 5xx (and network errors),
 *  honoring Retry-After when the NHL sends one. `revalidate` is the Next.js
 *  fetch-cache lifetime in seconds. */
export async function fetchNhlJson<T>(url: string, revalidate: number): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Number(null) is 0, so a missing header has to be checked for
      // explicitly or every retry would fire instantly.
      const header = lastError && "retryAfter" in lastError ? lastError.retryAfter : null;
      const retryAfterSec = typeof header === "string" && header.trim() !== "" ? Number(header) : NaN;
      const backoff = Number.isFinite(retryAfterSec)
        ? retryAfterSec * 1000
        : BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 250;
      await sleep(Math.min(backoff, MAX_BACKOFF_MS));
    }
    let res: Response;
    try {
      res = await fetch(url, { next: { revalidate } });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    const error = Object.assign(new Error(`NHL API ${res.status} for ${url}`), {
      retryAfter: res.headers.get("retry-after"),
    });
    if (!isRetryable(res.status)) throw error;
    lastError = error;
  }
  throw lastError ?? new Error(`NHL API request failed for ${url}`);
}

/** Runs `fn` over every item a few at a time instead of all at once - the
 *  NHL rate-limits a 32-request burst far more often than a steady trickle.
 *  Results keep the input order. */
export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    results.push(...(await Promise.all(items.slice(i, i + batchSize).map(fn))));
  }
  return results;
}
