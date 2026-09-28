import { NextResponse } from "next/server";
import { getCachedPlayerEligibility } from "@/lib/yahoo-fantasy-client";

// A plain DB read - deliberately public, no site-sign-in or Yahoo
// connection required at all. This is just NHL player position metadata
// (not user- or league-specific, nothing sensitive), and the whole point
// of the cron-backed cache (see refreshPlayerEligibilityCache/
// getCachedPlayerEligibility in yahoo-fantasy-client.ts) is that correct
// positions shouldn't depend on the viewer's own account state in any way -
// gating this behind site auth would have defeated that for anyone not
// signed in (e.g. an incognito visitor).
export async function GET() {
  try {
    const eligibility = await getCachedPlayerEligibility();
    return NextResponse.json({ eligibility });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load player eligibility" },
      { status: 502 }
    );
  }
}
