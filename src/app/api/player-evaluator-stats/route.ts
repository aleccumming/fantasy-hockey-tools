import { NextResponse } from "next/server";
import { getPlayerEvaluatorStats } from "@/lib/player-evaluator-service";

export async function GET() {
  try {
    const windows = await getPlayerEvaluatorStats();
    return NextResponse.json({ windows, computedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load player evaluator stats" },
      { status: 502 }
    );
  }
}
