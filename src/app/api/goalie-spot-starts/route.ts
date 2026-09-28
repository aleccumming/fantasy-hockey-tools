import { NextRequest, NextResponse } from "next/server";
import { getLiveSpotStarts } from "@/lib/goalie-spot-start-service";
import { currentWeekRange } from "@/lib/schedule";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const defaultRange = currentWeekRange();
  const start = searchParams.get("start") ?? defaultRange.start;
  const end = searchParams.get("end") ?? defaultRange.end;

  try {
    const spotStarts = await getLiveSpotStarts(start, end);
    return NextResponse.json({ spotStarts, computedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load goalie spot starts" },
      { status: 502 }
    );
  }
}
