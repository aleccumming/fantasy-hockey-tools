import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// One-time helper: drizzle-kit push was run against the local dev DB
// (.env.local's DATABASE_URL, a local Postgres instance) rather than
// production's Neon database, so nst_data_cache never got created there.
// This runs the equivalent DDL through the app's own already-correctly-
// configured DB connection, no production connection string needed
// locally. Delete this route once it's been hit successfully once.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "nst_data_cache" (
      "id" text PRIMARY KEY NOT NULL,
      "data" jsonb NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);

  return NextResponse.json({ ok: true });
}
