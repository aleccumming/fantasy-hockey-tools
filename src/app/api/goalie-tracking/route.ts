import { NextResponse } from "next/server";
import { getGoalieStartTracking } from "@/lib/goalie-tracking-service";

export async function GET() {
  try {
    const { data, updatedAt } = await getGoalieStartTracking();
    // updatedAt is when NST was last pulled, not this request's time.
    return NextResponse.json({ goalies: data, computedAt: updatedAt.toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load goalie start tracking" },
      { status: 502 }
    );
  }
}
