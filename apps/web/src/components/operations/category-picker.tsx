/**
 * Category picker: a type-to-search box AND a full dropdown, side by side.
 *
 * The tree is ~117 entries, so a bare <select> means scrolling a wall of options — but
 * search alone removes the ability to BROWSE, which matters when you don't yet know
 * what the tree contains. Both controls are rendered and both are submitted; the
 * server action prefers the search box when it has text, and falls back to the select.
 *
 * Native <input list> + <datalist> gives real typeahead with NO client JavaScript, so
 * this stays a server component and RTL keeps working.
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

/** Indented so hierarchy is readable inside a flat <select>. */
function indentedLabel(c: PickerCategory, locale: string): string {
  const depth = c.key.split(".").length - 1;
  return `${"  ".repeat(depth)}${locale === "he" ? c.nameHe : c.nameEn}`;
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
  labels,
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
  labels: { none: string; income: string; expense: string };
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const income = categories.filter((c) => c.axis === "INCOME");
  const expense = categories.filter((c) => c.axis === "EXPENSE");
  const cls = compact
    ? "min-w-44 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs"
    : "w-full min-w-48 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        name={`${name}Label`}
        list={listId}
        placeholder={placeholder}
        autoComplete="off"
        className={cls}
      />
      <select name={`${name}Id`} defaultValue={defaultCategoryId ?? ""} required={required} className={cls}>
        <option value="">{labels.none}</option>
        <optgroup label={labels.expense}>
          {expense.map((c) => (
            <option key={c.id} value={c.id}>{indentedLabel(c, locale)}</option>
          ))}
        </optgroup>
        <optgroup label={labels.income}>
          {income.map((c) => (
            <option key={c.id} value={c.id}>{indentedLabel(c, locale)}</option>
          ))}
        </optgroup>
      </select>
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c.id} value={categoryLabel(c, byId, locale)} />
        ))}
      </datalist>
    </span>
  );
}
