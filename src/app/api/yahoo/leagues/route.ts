import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { yahooConnections } from "@/db/schema";
import { getValidYahooAccessToken, getUserLeagues, YahooNotConnectedError } from "@/lib/yahoo-fantasy-client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const accessToken = await getValidYahooAccessToken(session.user.id);
    const [leagues, [row]] = await Promise.all([
      getUserLeagues(accessToken),
      db
        .select({ activeLeagueKey: yahooConnections.activeLeagueKey })
        .from(yahooConnections)
        .where(eq(yahooConnections.userId, session.user.id)),
    ]);

    // A single league is the common case - just use it, no picker needed.
    let activeLeagueKey = row?.activeLeagueKey ?? null;
    if (!activeLeagueKey && leagues.length === 1) {
      activeLeagueKey = leagues[0].leagueKey;
      await db
        .update(yahooConnections)
        .set({ activeLeagueKey, updatedAt: new Date() })
        .where(eq(yahooConnections.userId, session.user.id));
    }

    return NextResponse.json({ leagues, activeLeagueKey });
  } catch (err) {
    if (err instanceof YahooNotConnectedError) {
      return NextResponse.json({ leagues: [], activeLeagueKey: null, connected: false });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Yahoo leagues" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { leagueKey } = (await request.json()) as { leagueKey?: string };
  if (!leagueKey) return NextResponse.json({ error: "leagueKey is required" }, { status: 400 });

  await db
    .update(yahooConnections)
    .set({ activeLeagueKey: leagueKey, updatedAt: new Date() })
    .where(eq(yahooConnections.userId, session.user.id));

  return NextResponse.json({ activeLeagueKey: leagueKey });
}
