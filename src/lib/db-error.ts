function hasCode(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === code
  );
}

/** Prisma unique-constraint violation. */
export const isUniqueError = (e: unknown) => hasCode(e, "P2002");

/** Prisma foreign-key constraint violation (row is referenced elsewhere). */
export const isFkError = (e: unknown) => hasCode(e, "P2003");
