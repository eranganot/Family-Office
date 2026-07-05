import { getTranslations } from "next-intl/server";
import { Field, TextInput } from "./fields";

export interface MemberOption {
  id: string;
  name: string;
}

/** One share input per active member, named own_<memberId>. Must sum to 100. */
export async function OwnershipFields({ members }: { members: MemberOption[] }) {
  const t = await getTranslations("forms");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm text-neutral-600">{t("ownership")}</legend>
      <div className="grid grid-cols-2 gap-3">
        {members.map((m, i) => (
          <Field key={m.id} label={m.name}>
            <TextInput
              name={`own_${m.id}`}
              inputMode="decimal"
              defaultValue={members.length === 1 && i === 0 ? "100" : ""}
              placeholder="0"
            />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}
