/** Patch type compatible with zod .partial() under exactOptionalPropertyTypes. */
export type PatchOf<T> = { [K in keyof T]?: T[K] | undefined };

/** Drop keys whose value is undefined (Prisma updates must not receive explicit undefined). */
export function compact<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as never;
}
