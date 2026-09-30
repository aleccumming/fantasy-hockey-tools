import { NextRequest, NextResponse } from "next/server";
import { getGameDayGoalieStarts } from "@/lib/gameday-goalie-starts";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  try {
    const entries = await getGameDayGoalieStarts(date);
    return NextResponse.json({ date, entries, computedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load goalie starts" },
      { status: 502 }
    );
  }
}
