import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import { DraftsList } from "@/components/drafts-list";
import { ImportLocalDraft } from "@/components/import-local-draft";

export default async function DraftsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const rows = await db
    .select({
      id: drafts.id,
      name: drafts.name,
      updatedAt: drafts.updatedAt,
    })
    .from(drafts)
    .where(eq(drafts.userId, session.user.id))
    .orderBy(desc(drafts.updatedAt));

  const initialDrafts = rows.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
          Your Drafts
        </h1>
        <Link
          href="/how-to-use"
          className="mt-1 shrink-0 text-sm font-medium text-rink-blue hover:underline"
        >
          How to Use
        </Link>
      </div>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 text-sm text-ink-dim">
        Create a new draft or open one you&apos;ve already started.
      </p>

      <div className="mt-6">
        <ImportLocalDraft />
        <DraftsList initialDrafts={initialDrafts} />
      </div>
    </main>
  );
}
