import { NextResponse } from "next/server";
import { getDeploymentBoosts } from "@/lib/deployment-service";

export async function GET() {
  try {
    const windows = await getDeploymentBoosts();
    return NextResponse.json({ windows, computedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load deployment boosts" },
      { status: 502 }
    );
  }
}
