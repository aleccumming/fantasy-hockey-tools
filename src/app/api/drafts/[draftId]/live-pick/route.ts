import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import { isIgnorableMessage, findPlayerNameMatch, buildPlayerIndex } from "@/lib/kkupfl-relay";
import type { DraftPersistedState } from "@/lib/draft-state";
import type { DraftPick } from "@/lib/types";

// This endpoint is deliberately open (no session auth) - it's called from a
// script running on kkupfl.com's own origin, which can't carry our app's
// session cookie. Draft IDs are random UUIDs, and this only runs against a
// local dev server, so an unguessable-ID model is an acceptable trade-off
// for this experimental feature. Would need a real shared secret before any
// public deployment.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Private/Local Network Access: a public HTTPS site (kkupfl) reaching a
  // localhost target needs the server to explicitly opt in on the preflight,
  // separate from normal CORS - without this the browser blocks the request
  // before it's ever sent.
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    if (!UUID_RE.test(draftId)) {
      return NextResponse.json(
        { error: `Not a valid draft ID: "${draftId}" - did you forget to replace the placeholder?` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: CORS_HEADERS });
    }

    if (isIgnorableMessage(payload)) {
      return NextResponse.json({ ignored: true }, { headers: CORS_HEADERS });
    }

    // The whole read-modify-write happens inside one transaction with the
    // row locked (SELECT ... FOR UPDATE), so two nearly-simultaneous calls
    // for the same draft (e.g. an old relay script instance still running
    // in the background alongside a freshly-pasted one) can't race each
    // other and silently drop one pick - the second call's SELECT blocks
    // until the first call's UPDATE commits, so it always reads the other's
    // change rather than a stale copy.
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId))
        .for("update");
      if (!row) {
        return { status: 404 as const, body: { error: "Draft not found" } };
      }

      const state = row.state as DraftPersistedState;
      const msg = (payload as { message?: unknown }).message ?? payload;
      const index = buildPlayerIndex(state.players);
      const match = findPlayerNameMatch(msg, index);

      if (!match) {
        return { status: 200 as const, body: { matched: false } };
      }

      // When the caller knows the pick's exact position, address that slot
      // directly instead of guessing "next open slot" - a single unmatched
      // pick earlier in the draft would otherwise shift every pick after it
      // by one, cascading into a scrambled board (and once any round of the
      // draft reverses order, "next scanned" no longer even reliably means
      // "next chronological" at all). Direct addressing is self-healing:
      // re-running a full catch-up always converges on the right answer
      // regardless of what happened on a previous run. A caller that
      // already knows the overall pick number (kkupfl's own labels give us
      // this directly) can send `pickNumber` outright, which sidesteps any
      // risk of our `teamCount` disagreeing with the source site's; round +
      // pickInRound (what Fantrax's data gives us) is the fallback.
      const { round, pickInRound, pickNumber } = payload as {
        round?: unknown;
        pickInRound?: unknown;
        pickNumber?: unknown;
      };
      const targetPickNumber =
        typeof pickNumber === "number"
          ? pickNumber
          : typeof round === "number" && typeof pickInRound === "number"
            ? (round - 1) * state.settings.teamCount + pickInRound
            : null;

      const picks: DraftPick[] = [...state.picks];
      let targetIndex: number;

      if (targetPickNumber !== null) {
        targetIndex = picks.findIndex((p) => p.pickNumber === targetPickNumber);
        if (targetIndex === -1) {
          return {
            status: 409 as const,
            body: { matched: true, error: `No pick found for overall pick ${targetPickNumber}` },
          };
        }
        if (picks[targetIndex].playerId === match.id) {
          return {
            status: 200 as const,
            body: { matched: true, alreadyDrafted: true, player: match.name },
          };
        }
      } else {
        const alreadyDrafted = picks.some((p) => p.playerId === match.id);
        if (alreadyDrafted) {
          return {
            status: 200 as const,
            body: { matched: true, alreadyDrafted: true, player: match.name },
          };
        }
        targetIndex = picks.findIndex((p) => p.playerId === null);
        if (targetIndex === -1) {
          return { status: 409 as const, body: { matched: true, error: "No open picks left" } };
        }
      }

      picks[targetIndex] = { ...picks[targetIndex], playerId: match.id };

      await tx
        .update(drafts)
        .set({ state: { ...state, picks }, updatedAt: new Date() })
        .where(eq(drafts.id, draftId));

      return { status: 200 as const, body: { matched: true, drafted: match.name } };
    });

    return NextResponse.json(result.body, { status: result.status, headers: CORS_HEADERS });
  } catch (err) {
    // Log the real error server-side, but don't hand it back to the caller -
    // this endpoint is unauthenticated by necessity (it's called from a
    // script on another site's origin), so a raw exception message (which
    // could include DB driver internals) shouldn't be exposed to whoever's
    // hitting it. Still always attach CORS headers even on failure - a
    // plain Next.js 500 has none, which makes the browser report a
    // confusing "CORS header missing" instead of the real error.
    console.error("[live-pick] unexpected error", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
