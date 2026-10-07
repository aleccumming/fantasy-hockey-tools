// Server-only. Thin read/write wrapper around the shared nst_data_cache DB
// table - see that table's comment in src/db/schema.ts for why this exists
// (NST's own server is genuinely slow, 6-20s+, the first time it computes a
// "team games played"-filtered report; an in-memory-only cache meant a cold
// Vercel instance could make a real visitor pay that cost live). Each of the
// three NST-backed services (deployment, player-evaluator, goalie-tracking)
// reads its own row here instead of ever calling NST on the request path -
// only the daily refresh-nst-caches cron writes these rows.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nstDataCache } from "@/db/schema";

export type NstCacheId = "deployment" | "playerEvaluator" | "goalieTracking";

export async function readNstCacheRow<T>(id: NstCacheId): Promise<T | null> {
  const [row] = await db.select().from(nstDataCache).where(eq(nstDataCache.id, id));
  return row ? (row.data as T) : null;
}

export async function writeNstCacheRow<T>(id: NstCacheId, data: T): Promise<void> {
  await db
    .insert(nstDataCache)
    .values({ id, data: data as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: nstDataCache.id,
      set: { data: data as object, updatedAt: new Date() },
    });
}
