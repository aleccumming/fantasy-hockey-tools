// Server-only. Thin read/write wrapper around the shared nst_data_cache DB
// table - see that table's comment in src/db/schema.ts for why this exists
// (NST's own server is genuinely slow, 6-20s+, the first time it computes a
// "team games played"-filtered report; an in-memory-only cache meant a cold
// Vercel instance could make a real visitor pay that cost live). Each of the
// three NST-backed services (deployment, player-evaluator, goalie-tracking)
// reads its own row here instead of ever calling NST on the request path -
// only the daily refresh-nst-caches cron and the signed-in "Refresh" button
// (/api/refresh-stats) write these rows.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nstDataCache } from "@/db/schema";

export type NstCacheId = "deployment" | "playerEvaluator" | "goalieTracking";
/** Every row in the table: the NST datasets plus the stored NHL schedule
 *  (same "refresh daily, pages only read" pattern - see
 *  nhl-schedule-service.ts). Not refreshable from the stats Refresh button,
 *  which takes NstCacheId only. */
export type CacheRowId = NstCacheId | "nhlSchedule";

export interface NstCached<T> {
  data: T;
  /** When this data was actually computed from NST - not when it was read. */
  updatedAt: Date;
}

// Per warm serverless instance, on top of the DB row. Checked against the
// row's updatedAt on every read (one tiny query) rather than trusted
// forever: without that, a refresh written by one instance never reached
// the others - each kept serving whatever it first loaded until recycled.
const memory = new Map<CacheRowId, NstCached<unknown>>();

async function readUpdatedAt(id: CacheRowId): Promise<Date | null> {
  const [row] = await db
    .select({ updatedAt: nstDataCache.updatedAt })
    .from(nstDataCache)
    .where(eq(nstDataCache.id, id));
  return row?.updatedAt ?? null;
}

/** What every page request calls - never talks to NST directly. Serves the
 *  latest DB row (from memory when this instance already has that exact
 *  version); only falls back to `refresh` (a live NST fetch) if the row has
 *  genuinely never been seeded yet. */
export async function getNstCached<T>(id: CacheRowId, refresh: () => Promise<NstCached<T>>): Promise<NstCached<T>> {
  const cached = memory.get(id) as NstCached<T> | undefined;
  const latest = await readUpdatedAt(id);
  if (cached && (!latest || cached.updatedAt.getTime() >= latest.getTime())) return cached;

  const [row] = await db.select().from(nstDataCache).where(eq(nstDataCache.id, id));
  if (!row) return bootstrapOnce(id, refresh);
  const fresh = { data: row.data as T, updatedAt: row.updatedAt };
  memory.set(id, fresh);
  return fresh;
}

// Requests that all find the row missing (e.g. right after a new row type
// ships, before the cron's first run) share one live fetch instead of each
// starting their own.
const bootstrapping = new Map<CacheRowId, Promise<NstCached<unknown>>>();

function bootstrapOnce<T>(id: CacheRowId, refresh: () => Promise<NstCached<T>>): Promise<NstCached<T>> {
  let pending = bootstrapping.get(id) as Promise<NstCached<T>> | undefined;
  if (!pending) {
    pending = refresh().finally(() => bootstrapping.delete(id));
    bootstrapping.set(id, pending);
  }
  return pending;
}

/** When this dataset was last computed, without loading it - null if never. */
export async function getNstCacheUpdatedAt(id: CacheRowId): Promise<Date | null> {
  return readUpdatedAt(id);
}

export async function saveNstCached<T>(id: CacheRowId, data: T): Promise<NstCached<T>> {
  const updatedAt = new Date();
  await db
    .insert(nstDataCache)
    .values({ id, data: data as object, updatedAt })
    .onConflictDoUpdate({
      target: nstDataCache.id,
      set: { data: data as object, updatedAt },
    });
  const saved = { data, updatedAt };
  memory.set(id, saved);
  return saved;
}
