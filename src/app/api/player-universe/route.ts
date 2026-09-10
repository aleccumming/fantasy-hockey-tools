import { NextResponse } from "next/server";
import { getNhlRosterPlayers } from "@/lib/nhl-roster";

export interface PlayerUniverseEntry {
  name: string;
  team: string;
  positions: string[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  try {
    const players = await getNhlRosterPlayers(forceRefresh);
    const universe: PlayerUniverseEntry[] = players.map((p) => ({
      name: p.name,
      team: p.team,
      positions: p.positions,
    }));
    return NextResponse.json(universe);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load player universe" },
      { status: 502 }
    );
  }
}
