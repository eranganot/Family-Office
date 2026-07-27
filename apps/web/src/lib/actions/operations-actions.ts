"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

/**
 * M36 — Financial Operations server actions.
 *
 * Note the redirects go back to /operations regardless of workflow phase: the
 * operational workspace is cross-phase (owner decision D2) and must never bounce
 * the user into the strategic phase gate.
 */

export async function createManualTransactionAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const direction = str(fd, "direction"); // IN | OUT
  const rawAmount = str(fd, "amount").trim();
  const magnitude = Math.abs(Number(rawAmount));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    redirect(`/${locale}/operations?error=amount`);
  }
  // Signed convention: negative = outflow. The form asks for a direction and a
  // positive number, which is far less error-prone than asking for a signed value.
  const amount = direction === "IN" ? String(magnitude) : String(-magnitude);

  const categoryId = await resolveCategoryField(fd, "category", locale);
  const behavioralClass = str(fd, "behavioralClass");
  const instalmentNumber = str(fd, "instalmentNumber");
  const instalmentTotal = str(fd, "instalmentTotal");

  const trpc = await serverCaller();
  try {
    await trpc.operations.transactions.createManual({
      bookedAt: new Date(str(fd, "bookedAt")),
      amount,
      currency: str(fd, "currency") as never,
      description: str(fd, "description"),
      ...(categoryId ? { categoryId } : {}),
      ...(behavioralClass ? { behavioralClass: behavioralClass as never } : {}),
      ...(instalmentNumber && instalmentTotal
        ? { instalmentNumber: Number(instalmentNumber), instalmentTotal: Number(instalmentTotal) }
        : {}),
      isRecurringCandidate: fd.get("isRecurringCandidate") === "on",
    });
  } catch {
    redirect(`/${locale}/operations?error=create`);
  }
  redirect(`/${locale}/operations?created=1`);
}

export async function upsertCategoryAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const parentId = await resolveCategoryField(fd, "parent", locale);
  const trpc = await serverCaller();
  try {
    await trpc.operations.categories.upsert({
      axis: str(fd, "axis") as never,
      key: str(fd, "key"),
      nameEn: str(fd, "nameEn"),
      nameHe: str(fd, "nameHe"),
      defaultBehavioralClass: str(fd, "defaultBehavioralClass") as never,
      ...(parentId ? { parentId } : {}),
    });
  } catch {
    redirect(`/${locale}/operations?error=category&tab=categories`);
  }
  redirect(`/${locale}/operations?categorySaved=1&tab=categories`);
}

export async function recomputePeriodAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.operations.period.recompute({
      year: Number(str(fd, "year")),
      month: Number(str(fd, "month")),
    });
  } catch {
    redirect(`/${locale}/operations?error=recompute`);
  }
  redirect(`/${locale}/operations?recomputed=1`);
}

export async function closePeriodAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const note = str(fd, "reviewNote");
  const trpc = await serverCaller();
  try {
    await trpc.operations.period.close({
      year: Number(str(fd, "year")),
      month: Number(str(fd, "month")),
      ...(note ? { reviewNote: note } : {}),
    });
  } catch {
    redirect(`/${locale}/operations?error=close`);
  }
  redirect(`/${locale}/operations?closed=1`);
}

export async function reopenPeriodAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.operations.period.reopen({
      year: Number(str(fd, "year")),
      month: Number(str(fd, "month")),
    });
  } catch {
    redirect(`/${locale}/operations?error=reopen`);
  }
  redirect(`/${locale}/operations?reopened=1`);
}

/**
 * Teach the classifier from the suspense queue: one decision applies to every past and
 * future transaction from the same merchant.
 */
export async function bulkClassifyMerchantAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    const categoryId = await resolveCategoryField(fd, "category", locale);
    if (!categoryId) redirect(`/${locale}/operations?error=badcategory`);
    await trpc.operations.transactions.bulkClassifyByMerchant({
      merchantKey: str(fd, "merchantKey"),
      categoryId,
      behavioralClass: str(fd, "behavioralClass") as never,
    });
  } catch {
    redirect(`/${locale}/operations?error=classify`);
  }
  redirect(`/${locale}/operations?classified=1`);
}

export async function updateTransactionAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const direction = str(fd, "direction");
  const rawAmount = str(fd, "amount").trim();
  const magnitude = Math.abs(Number(rawAmount));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    redirect(`/${locale}/operations?error=amount`);
  }
  const amount = direction === "IN" ? String(magnitude) : String(-magnitude);
  const categoryId = await resolveCategoryField(fd, "category", locale);
  const behavioralClass = str(fd, "behavioralClass");
  const instalmentNumber = str(fd, "instalmentNumber");
  const instalmentTotal = str(fd, "instalmentTotal");

  const trpc = await serverCaller();
  try {
    await trpc.operations.transactions.update({
      id: str(fd, "id"),
      bookedAt: new Date(str(fd, "bookedAt")),
      amount,
      currency: str(fd, "currency") as never,
      description: str(fd, "description"),
      categoryId: categoryId ? categoryId : null,
      behavioralClass: behavioralClass ? (behavioralClass as never) : null,
      instalmentNumber: instalmentNumber ? Number(instalmentNumber) : null,
      instalmentTotal: instalmentTotal ? Number(instalmentTotal) : null,
      isRecurringCandidate: fd.get("isRecurringCandidate") === "on",
    });
  } catch {
    redirect(`/${locale}/operations?error=update&edit=${str(fd, "id")}`);
  }
  redirect(`/${locale}/operations?updated=1`);
}

/** Remove = VOID (reversible, keeps the classification history). Restore = BOOKED. */
export async function setTransactionStatusAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const status = str(fd, "status");
  const trpc = await serverCaller();
  try {
    await trpc.operations.transactions.setStatus({ id: str(fd, "id"), status: status as never });
  } catch {
    redirect(`/${locale}/operations?error=status`);
  }
  redirect(`/${locale}/operations?${status === "VOID" ? "removed" : "restored"}=1`);
}

/**
 * Upload a statement and jump straight to its preview. Uses the existing documents
 * pipeline so the original file lands in the access-controlled Document store — which
 * is where the un-redacted bytes stay, and the only place they exist.
 */
export async function uploadStatementAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(`/${locale}/operations?error=nofile`);

  // Server Actions cap the request body (next.config sets 25 MB). Base64 inflates
  // files ~34%, so check the real budget here and say so plainly — the platform's
  // own failure mode is an opaque "A server error occurred" with nothing in the logs.
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes * 1.34 > 24 * 1024 * 1024) {
    redirect(`/${locale}/operations?error=toolarge&mb=${Math.round(totalBytes / 1024 / 1024)}`);
  }

  const trpc = await serverCaller();
  const ids: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const doc = await trpc.documents.upload({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        institutionName: str(fd, "institutionName") || undefined,
        contentBase64: bytes.toString("base64"),
      });
      ids.push((doc as { id: string }).id);
    } catch {
      // A duplicate sha256 is rejected by the existing pipeline - that is correct
      // (the same file twice), and one bad file must not abort the whole batch.
      failed.push(file.name);
    }
  }
  if (ids.length === 0) {
    redirect(`/${locale}/operations?error=allfailed&n=${encodeURIComponent(String(failed.length))}`);
  }
  // Land on the first upload's preview; the rest queue up in the pending list.
  redirect(`/${locale}/operations?preview=${ids[0]}&uploaded=${ids.length}&failed=${failed.length}`);
}

export async function commitStatementAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const documentId = str(fd, "documentId");
  const amountMode = str(fd, "amountMode") as "SIGNED" | "DEBIT_CREDIT";
  const col = (n: string): string | undefined => str(fd, n) || undefined;

  const mapping = {
    amountMode,
    defaultCurrency: (str(fd, "defaultCurrency") || "ILS") as never,
    dayFirst: true,
    columns: {
      date: str(fd, "col_date"),
      description: str(fd, "col_description"),
      amount: col("col_amount"),
      debit: col("col_debit"),
      credit: col("col_credit"),
      currency: col("col_currency"),
      valueDate: col("col_valueDate"),
      reference: col("col_reference"),
      pendingMarker: col("col_pendingMarker"),
    },
  };
  const saveAs = str(fd, "saveProfileAs");

  // A PDF has no columns to map; the service detects the format and ignores `mapping`.
  const isPdf = mapping.columns.date === "-";
  const trpc = await serverCaller();
  let result: { inserted: number; duplicates: number } | undefined;
  try {
    result = await trpc.operations.import.commit({
      documentId,
      adapterId: isPdf ? "pdf-statement" : "generic-tabular",
      ...(isPdf ? {} : { mapping: mapping as never }),
      ...(saveAs && !isPdf ? { saveProfileAs: saveAs } : {}),
    });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 60)) : "IMPORT_FAILED";
    redirect(`/${locale}/operations?error=${code}&preview=${documentId}`);
  }
  redirect(`/${locale}/operations?imported=${result?.inserted ?? 0}&dupes=${result?.duplicates ?? 0}`);
}

/**
 * Resolve the category picker's two fields to an id.
 *
 * The picker submits BOTH a search label (`<name>Label`) and a dropdown id
 * (`<name>Id`). The typed label wins when present — it is the more deliberate act —
 * otherwise the dropdown selection is used. An unrecognised label returns null, so an
 * unmatched category is left unset rather than silently guessed at.
 */
async function resolveCategoryField(fd: FormData, name: string, locale: string): Promise<string | null> {
  const label = str(fd, `${name}Label`).trim();
  const selected = str(fd, `${name}Id`).trim();
  if (!label) return selected || null;
  const byLabel = await resolveCategoryLabel(label, locale);
  return byLabel ?? (selected || null);
}

async function resolveCategoryLabel(label: string, locale: string): Promise<string | null> {
  const clean = label.trim();
  if (!clean) return null;
  const trpc = await serverCaller();
  const { flat } = await trpc.operations.categories.tree();
  const rows = flat as unknown as Array<{ id: string; nameEn: string; nameHe: string; parentId: string | null }>;
  const byId = new Map(rows.map((c) => [c.id, c]));
  const nameOf = (c: { nameEn: string; nameHe: string }) => (locale === "he" ? c.nameHe : c.nameEn);
  const pathOf = (c: (typeof rows)[number]): string => {
    const parts = [nameOf(c)];
    let cur = c.parentId ? byId.get(c.parentId) : undefined;
    let guard = 0;
    while (cur && guard < 6) {
      parts.unshift(nameOf(cur));
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      guard += 1;
    }
    return parts.join(" › ");
  };
  const exact = rows.find((c) => pathOf(c) === clean);
  if (exact) return exact.id;
  const byLeaf = rows.filter((c) => nameOf(c) === clean);
  return byLeaf.length === 1 ? byLeaf[0]!.id : null;
}

export { resolveCategoryLabel, resolveCategoryField };

/** Import every pending statement that needs no mapping decision (mainly PDFs). */
export async function commitAllPendingAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  let r: { inserted: number; duplicates: number; skipped: Array<{ filename: string }> } | undefined;
  try {
    r = await trpc.operations.import.commitAllPending();
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "BULK_FAILED";
    redirect(`/${locale}/operations?error=${code}`);
  }
  redirect(
    `/${locale}/operations?imported=${r?.inserted ?? 0}&dupes=${r?.duplicates ?? 0}&skipped=${r?.skipped.length ?? 0}`,
  );
}
