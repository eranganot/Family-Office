import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@wealthos/i18n";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
