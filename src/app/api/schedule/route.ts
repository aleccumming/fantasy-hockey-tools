import { NextResponse } from "next/server";
import { getScheduleAnalysis } from "@/lib/nhl-schedule-service";

export async function GET() {
  try {
    const analysis = await getScheduleAnalysis();
    return NextResponse.json(analysis);
  } catch (err) {
    // Logged so prod logs show WHY, not just a bare 502.
    console.error("/api/schedule failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load schedule" },
      { status: 502 }
    );
  }
}
