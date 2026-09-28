import { NextResponse } from "next/server";
import { getGoalieStartTracking } from "@/lib/goalie-tracking-service";

export async function GET() {
  try {
    const goalies = await getGoalieStartTracking();
    return NextResponse.json({ goalies, computedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load goalie start tracking" },
      { status: 502 }
    );
  }
}
