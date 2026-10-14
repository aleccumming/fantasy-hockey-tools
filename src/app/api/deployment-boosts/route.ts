import { NextResponse } from "next/server";
import { getDeploymentBoosts } from "@/lib/deployment-service";

export async function GET() {
  try {
    const { data, updatedAt } = await getDeploymentBoosts();
    // updatedAt is when NST was last pulled, not this request's time.
    return NextResponse.json({ baselines: data, computedAt: updatedAt.toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load deployment boosts" },
      { status: 502 }
    );
  }
}
