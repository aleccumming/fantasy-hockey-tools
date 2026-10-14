import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshDeploymentCache } from "@/lib/deployment-service";
import { refreshPlayerEvaluatorCache } from "@/lib/player-evaluator-service";
import { refreshGoalieTrackingCache } from "@/lib/goalie-tracking-service";
import { getNstCacheUpdatedAt, type NstCacheId } from "@/lib/nst-data-cache";

// One dataset's NST pull. Usually a few seconds (all three datasets took
// ~2s together, measured 2026-10-14), but a report NST hasn't computed in a
// while can take 6-20s+, so this gets the same headroom as the cron route.
export const maxDuration = 60;

// NST is a free site and a refresh fires several heavy reports at once, so
// the button can't be allowed to hammer it - anything refreshed this
// recently (by anyone, including the daily cron) is just reported back.
const MIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const REFRESHERS: Record<NstCacheId, () => Promise<{ updatedAt: Date }>> = {
  playerEvaluator: refreshPlayerEvaluatorCache,
  deployment: refreshDeploymentCache,
  goalieTracking: refreshGoalieTrackingCache,
};

/** The on-demand counterpart to the daily refresh-nst-caches cron, for one
 *  dataset at a time. Signed-in users only - see the throttle above. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to refresh stats" }, { status: 401 });

  const { dataset } = (await req.json().catch(() => ({}))) as { dataset?: string };
  if (!dataset || !(dataset in REFRESHERS)) {
    return NextResponse.json({ error: "Unknown dataset" }, { status: 400 });
  }
  const id = dataset as NstCacheId;

  const last = await getNstCacheUpdatedAt(id);
  if (last && Date.now() - last.getTime() < MIN_REFRESH_INTERVAL_MS) {
    return NextResponse.json({ refreshed: false, updatedAt: last.toISOString() });
  }

  try {
    const { updatedAt } = await REFRESHERS[id]();
    return NextResponse.json({ refreshed: true, updatedAt: updatedAt.toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't refresh from Natural Stat Trick" },
      { status: 502 }
    );
  }
}
