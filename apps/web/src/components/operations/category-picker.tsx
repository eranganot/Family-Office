/**
 * Type-to-search category picker.
 *
 * The category tree is ~117 entries; a flat <select> forces the user to scroll a wall
 * of options. This uses a native <input list> + <datalist>, which gives real typeahead
 * with NO client JavaScript — it stays a server component, keeps RTL behaviour correct,
 * and degrades to a plain text field if datalist is unsupported.
 *
 * The submitted value is the display label ("דיור › ארנונה"), which the server action
 * resolves back to an id. Labels are made unique by including the parent path, so the
 * lookup is unambiguous even where leaf names repeat (e.g. "אחר" under two parents).
 */
export interface PickerCategory {
  id: string;
  key: string;
  nameEn: string;
  nameHe: string;
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
  className,
}: {
  name: string;
  categories: PickerCategory[];
  locale: string;
  defaultCategoryId?: string | null | undefined;
  placeholder: string;
  required?: boolean | undefined;
  /** Datalists are shared by id; pass a stable one so the options render once. */
  listId: string;
  className?: string | undefined;
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const current = defaultCategoryId ? byId.get(defaultCategoryId) : undefined;
  return (
    <>
      <input
        type="text"
        name={name}
        list={listId}
        defaultValue={current ? categoryLabel(current, byId, locale) : ""}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={
          className ??
          // min-w matters: inside a narrow table cell, w-full alone collapses the field
          // to the width of its dropdown arrow and the control becomes unusable.
          "w-full min-w-48 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        }
      />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c.id} value={categoryLabel(c, byId, locale)} />
        ))}
      </datalist>
    </>
  );
}
