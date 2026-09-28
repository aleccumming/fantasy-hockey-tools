import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { yahooConnections } from "@/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ connected: false });
  }

  const [row] = await db
    .select({ expiresAt: yahooConnections.expiresAt })
    .from(yahooConnections)
    .where(eq(yahooConnections.userId, session.user.id));

  return NextResponse.json({ connected: !!row, expiresAt: row?.expiresAt ?? null });
}
