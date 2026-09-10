import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { drafts } from "@/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { draftId } = await params;

  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, session.user.id)));

  if (!row) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { draftId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: { state?: unknown; name?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if ("state" in body) updates.state = body.state;
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();

  const [row] = await db
    .update(drafts)
    .set(updates)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, session.user.id)))
    .returning({ id: drafts.id });

  if (!row) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { draftId } = await params;

  const [row] = await db
    .delete(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, session.user.id)))
    .returning({ id: drafts.id });

  if (!row) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
