import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import { DEFAULT_DRAFT_STATE } from "@/lib/draft-state";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: drafts.id,
      name: drafts.name,
      createdAt: drafts.createdAt,
      updatedAt: drafts.updatedAt,
    })
    .from(drafts)
    .where(eq(drafts.userId, session.user.id))
    .orderBy(desc(drafts.updatedAt));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New Draft";
  const state = { ...DEFAULT_DRAFT_STATE, ...(body.state ?? {}) };

  const [row] = await db
    .insert(drafts)
    .values({ userId: session.user.id, name, state })
    .returning({ id: drafts.id, name: drafts.name });

  return NextResponse.json(row, { status: 201 });
}
