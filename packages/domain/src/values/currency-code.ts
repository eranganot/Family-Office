import { z } from "zod";

/** Supported currencies (registry-extensible in later milestones). ISO-4217. */
export const CurrencyCodeSchema = z.enum(["ILS", "USD", "EUR"]);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
