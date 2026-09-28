import { NextResponse } from "next/server";
import { currentWeekRange, getGameDatesInRangeByTeam } from "@/lib/schedule";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const fallback = currentWeekRange();
  const start = startParam && DATE_RE.test(startParam) ? startParam : fallback.start;
  const end = endParam && DATE_RE.test(endParam) ? endParam : fallback.end;

  if (end < start) {
    return NextResponse.json({ error: "End date must not be before start date" }, { status: 400 });
  }

  try {
    const gameDatesByTeam = await getGameDatesInRangeByTeam(start, end);
    return NextResponse.json({ start, end, gameDatesByTeam });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load schedule" },
      { status: 502 }
    );
  }
}
