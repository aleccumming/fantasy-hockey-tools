import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import { DraftStoreProvider } from "@/store/draft-store-provider";
import { DraftWorkspace } from "@/components/draft-workspace";
import { DEFAULT_DRAFT_STATE, type DraftPersistedState } from "@/lib/draft-state";

export default async function DraftByIdPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, session.user.id)));

  if (!row) redirect("/draft");

  return (
    <DraftStoreProvider
      key={draftId}
      draftId={draftId}
      initialState={{ ...DEFAULT_DRAFT_STATE, ...(row.state as DraftPersistedState) }}
    >
      <DraftWorkspace draftName={row.name} />
    </DraftStoreProvider>
  );
}
