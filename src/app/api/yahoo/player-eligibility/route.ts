import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCachedPlayerEligibility } from "@/lib/yahoo-fantasy-client";

// A plain DB read - not tied to the requesting user's own Yahoo connection
// (see refreshPlayerEligibilityCache/getCachedPlayerEligibility in
// yahoo-fantasy-client.ts). A daily cron job keeps the underlying cache
// fresh in the background, so no page load ever waits on Yahoo here.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
