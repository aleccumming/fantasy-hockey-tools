import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidYahooAccessToken, getAllPlayerEligibility, YahooNotConnectedError } from "@/lib/yahoo-fantasy-client";

// Not league-scoped - any signed-in, Yahoo-connected user's token works,
// since this is public game data (every NHL player's position eligibility),
// not something specific to their account or league.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const accessToken = await getValidYahooAccessToken(session.user.id);
    const eligibility = await getAllPlayerEligibility(accessToken);
    return NextResponse.json({ eligibility });
  } catch (err) {
    if (err instanceof YahooNotConnectedError) {
      return NextResponse.json({ eligibility: null, connected: false });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Yahoo player eligibility" },
      { status: 502 }
    );
  }
}
