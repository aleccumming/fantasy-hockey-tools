import { NextResponse } from "next/server";
import { getHeadshotMap } from "@/lib/headshots";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  try {
    const map = await getHeadshotMap(forceRefresh);
    return NextResponse.json(map);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load headshots" },
      { status: 502 }
    );
  }
}
