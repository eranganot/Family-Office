import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@wealthos/i18n";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  // WO-3: the NEXT_LOCALE cookie was sent without Secure.
  localeCookie: { sameSite: "lax", secure: process.env.NODE_ENV === "production" },
});
