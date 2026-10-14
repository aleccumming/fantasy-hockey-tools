import { NextResponse } from "next/server";
import { getPlayerEvaluatorStats } from "@/lib/player-evaluator-service";

export async function GET() {
  try {
    const { data, updatedAt } = await getPlayerEvaluatorStats();
    // updatedAt is when NST was last pulled, not this request's time.
    return NextResponse.json({ windows: data, computedAt: updatedAt.toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load player evaluator stats" },
      { status: 502 }
    );
  }
}
