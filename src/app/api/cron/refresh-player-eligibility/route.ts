import { NextRequest, NextResponse } from "next/server";
import { getAnyValidYahooAccessToken, refreshPlayerEligibilityCache } from "@/lib/yahoo-fantasy-client";

// The real fetch is ~80 sequential Yahoo requests and took ~12s in testing;
// Vercel's default function timeout (10s) isn't enough headroom.
export const maxDuration = 30;

// Runs daily via vercel.json's crons config (Vercel automatically sends
// CRON_SECRET as the Authorization header - see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// This is the ONLY thing that keeps the player-eligibility cache warm -
// no page request ever triggers a live Yahoo fetch, so this job running on
// schedule is what makes "always correct, no wait" actually true.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const accessToken = await getAnyValidYahooAccessToken();
  if (!accessToken) {
    // Nobody has ever connected Yahoo - nothing to refresh with yet. Not a
    // failure, just nothing to do.
    return NextResponse.json({ refreshed: false, reason: "No Yahoo connection available" });
  }

  const players = await refreshPlayerEligibilityCache(accessToken);
  return NextResponse.json({ refreshed: true, playerCount: players.length });
}
