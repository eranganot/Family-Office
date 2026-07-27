/**
 * Category picker — ONE control that both searches and browses.
 *
 * History worth keeping: this was first a plain <select> (a wall of ~117 options), then
 * a search box (which lost browsing), then search + select side by side (which was
 * duplicated clutter, especially in a table row). The resolution is a single native
 * <input list> + <datalist>: typing filters, and the dropdown arrow reveals the whole
 * list — browse and search in one field, with NO client JavaScript, so this stays a
 * server component and RTL keeps working.
 *
 * Options carry their parent path ("דיור › ארנונה") so repeated leaf names ("אחר") are
 * unambiguous. The server action resolves the label back to an id, falling back to the
 * hidden current-value field when the box is left untouched.
 */
export interface PickerCategory {
  id: string;
  key: string;
  nameEn: string;
  nameHe: string;
  axis: "INCOME" | "EXPENSE";
  parentId: string | null;
}

export function categoryLabel(
  c: PickerCategory,
  byId: Map<string, PickerCategory>,
  locale: string,
): string {
  const name = (x: PickerCategory) => (locale === "he" ? x.nameHe : x.nameEn);
  const parts: string[] = [name(c)];
  let cursor = c.parentId ? byId.get(c.parentId) : undefined;
  let guard = 0;
  while (cursor && guard < 6) {
    parts.unshift(name(cursor));
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    guard += 1;
  }
  return parts.join(" › ");
}

export function CategoryPicker({
  name,
  categories,
  locale,
  defaultCategoryId,
  placeholder,
  required,
  listId,
  compact,
}: {
  /** Base field name. Submits `${name}Label` (search) and `${name}Id` (dropdown). */
  name: string;
  categories: PickerCategory[];
  locale: string;
  defaultCategoryId?: string | null | undefined;
  placeholder: string;
  required?: boolean | undefined;
  /** Datalists are shared by id; pass a stable one so the options render once. */
  listId: string;
  compact?: boolean | undefined;
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const cls = compact
    ? "min-w-44 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs"
    : "w-full min-w-48 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

  const current = defaultCategoryId ? byId.get(defaultCategoryId) : undefined;
  return (
    <>
      <input
        type="text"
        name={`${name}Label`}
        list={listId}
        defaultValue={current ? categoryLabel(current, byId, locale) : ""}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        className={cls}
      />
      {/* Preserves the existing category when the box is left untouched. */}
      <input type="hidden" name={`${name}Id`} value={defaultCategoryId ?? ""} />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c.id} value={categoryLabel(c, byId, locale)} />
        ))}
      </datalist>
    </>
  );
}
