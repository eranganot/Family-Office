export function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

export function opt(fd: FormData, name: string): string | undefined {
  const v = str(fd, name);
  return v === "" ? undefined : v;
}

export function bool(fd: FormData, name: string): boolean {
  return fd.get(name) === "on";
}

/** Ownership fields are named own_<memberId>; empty or 0 entries are skipped. */
export function ownership(fd: FormData): { familyMemberId: string; sharePct: string }[] {
  const shares: { familyMemberId: string; sharePct: string }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("own_")) continue;
    const pct = String(value).trim();
    if (pct === "" || Number(pct) === 0) continue;
    shares.push({ familyMemberId: key.slice(4), sharePct: pct });
  }
  return shares;
}

export function valuation(fd: FormData): { asOf: Date; value: string; currency: never; confidence: number } | undefined {
  const value = opt(fd, "value");
  if (!value) return undefined;
  return {
    asOf: new Date(opt(fd, "valueDate") ?? new Date().toISOString()),
    value,
    currency: str(fd, "currency") as never,
    confidence: Number(opt(fd, "confidence") ?? 50),
  };
}
