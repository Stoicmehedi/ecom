import "server-only";
import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityAction, ActivityModule } from "@/lib/activity-constants";

export type { ActivityAction, ActivityModule } from "@/lib/activity-constants";

/**
 * The activity log — who did what, and when (BLUEPRINT §29).
 *
 * One helper, so ~40 call sites across the action files cannot each invent their
 * own shape — the same discipline as the single guard helper (§25.3). If you add a
 * mutating server action, add a `logActivity` line to it; if you log, use this.
 *
 * It writes an APPEND-ONLY row: the app never updates or deletes activity rows, and
 * there is no UI or action that can. A delete of the *document* is itself logged as
 * its own row, and the document's earlier rows survive it — which is why the row
 * holds a loose `doc` pointer, never a foreign key.
 */

/** A loose pointer to the document, for the View link. Never a foreign key. */
export type ActivityDoc = {
  /** The route base for the link — e.g. "sales", "purchases", "products". */
  type: string;
  /** The human document number, e.g. "IN-10001". */
  no?: string | null;
  /** The numeric id, for the link. Kept even after the document is deleted. */
  id?: number | null;
};

export type ActivityActor = { id: number | null; name: string };

// Both the singleton client and a `$transaction` callback client satisfy this — the
// full client has a superset of the transaction client's methods.
type Db = Prisma.TransactionClient;

/**
 * The signed-in user, read on the server. The name is COPIED into the row, so the
 * entry still reads if the user is later deleted (the id then dangles harmlessly).
 */
export async function activityActor(): Promise<ActivityActor> {
  const session = await auth();
  const id = session?.user?.id ? Number(session.user.id) : null;
  const name =
    session?.user?.name?.trim() ||
    session?.user?.username?.trim() ||
    (id ? `#${id}` : "system");
  return { id, name };
}

/**
 * Write one activity row. Pass the transaction client (`tx`) when the action runs
 * inside `$transaction`, so the log line rolls back with the write it records; pass
 * the `prisma` singleton for a single-statement action.
 *
 * Pass `actor` to reuse a session the caller already read; otherwise it is read here.
 */
export async function logActivity(
  db: Db,
  entry: {
    module: ActivityModule;
    action: ActivityAction;
    details: string;
    doc?: ActivityDoc | null;
    branchId?: number | null;
    actor?: ActivityActor;
  },
): Promise<void> {
  const actor = entry.actor ?? (await activityActor());
  await db.activityLog.create({
    data: {
      userId: actor.id,
      userName: actor.name,
      module: entry.module,
      action: entry.action,
      details: entry.details,
      docType: entry.doc?.type ?? null,
      docNo: entry.doc?.no ?? null,
      docId: entry.doc?.id ?? null,
      branchId: entry.branchId ?? null,
    },
  });
}
