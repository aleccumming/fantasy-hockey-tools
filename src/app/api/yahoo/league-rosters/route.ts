import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getValidYahooAccessToken,
  getLeagueRosters,
  getLeagueRosterSlots,
  YahooNotConnectedError,
} from "@/lib/yahoo-fantasy-client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const leagueKey = req.nextUrl.searchParams.get("leagueKey");
  if (!leagueKey) return NextResponse.json({ error: "leagueKey is required" }, { status: 400 });

  try {
    const accessToken = await getValidYahooAccessToken(session.user.id);
    const [teams, slots] = await Promise.all([
      getLeagueRosters(leagueKey, accessToken),
      getLeagueRosterSlots(leagueKey, accessToken),
    ]);
    return NextResponse.json({ teams, slots });
  } catch (err) {
    if (err instanceof YahooNotConnectedError) {
      return NextResponse.json({ error: "Yahoo account not connected" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Yahoo league rosters" },
      { status: 502 }
    );
  }
}
