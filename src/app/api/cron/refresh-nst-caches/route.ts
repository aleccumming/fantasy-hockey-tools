import { NextRequest, NextResponse } from "next/server";
import { refreshDeploymentCache } from "@/lib/deployment-service";
import { refreshPlayerEvaluatorCache } from "@/lib/player-evaluator-service";
import { refreshGoalieTrackingCache } from "@/lib/goalie-tracking-service";

// NST's own server is slow (6-20s+, confirmed live) the first time it
// computes a "team games played"-filtered report - this cron can easily
// run long if NST's internal cache for yesterday's exact query params has
// since expired, which is the common case for a once-a-day job.
export const maxDuration = 60;

// Runs daily via vercel.json's crons config (Vercel automatically sends
// CRON_SECRET as the Authorization header). This is the ONLY thing that
// keeps the three NST-backed caches (Deployment, Skaters/Player Evaluator,
// Goalie Start Tracking) warm - no page request ever calls NST directly,
// see nst-data-cache.ts - so a real visitor never pays NST's slow
// first-computation cost live, only however stale the last cron run left
// the data (up to ~24h, judged an acceptable tradeoff per user feedback:
// this data doesn't need to be fresher than once or twice a day).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await Promise.allSettled([
    refreshDeploymentCache(),
    refreshPlayerEvaluatorCache(),
    refreshGoalieTrackingCache(),
  ]);

  const [deployment, playerEvaluator, goalieTracking] = results;
  return NextResponse.json({
    deployment: deployment.status,
    playerEvaluator: playerEvaluator.status,
    goalieTracking: goalieTracking.status,
    errors: results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))),
  });
}
