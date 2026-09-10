import { NextResponse } from "next/server";
import { getScheduleAnalysis } from "@/lib/schedule";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  try {
    const analysis = await getScheduleAnalysis(forceRefresh);
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load schedule" },
      { status: 502 }
    );
  }
}
