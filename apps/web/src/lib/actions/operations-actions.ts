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

  const categoryId = str(fd, "categoryId");
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

export async function classifyTransactionAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.operations.transactions.classify({
      transactionIds: [str(fd, "transactionId")],
      categoryId: str(fd, "categoryId"),
      behavioralClass: str(fd, "behavioralClass") as never,
    });
  } catch {
    redirect(`/${locale}/operations?error=classify`);
  }
  redirect(`/${locale}/operations?classified=1`);
}

export async function upsertCategoryAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const parentId = str(fd, "parentId");
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
    await trpc.operations.transactions.bulkClassifyByMerchant({
      merchantKey: str(fd, "merchantKey"),
      categoryId: str(fd, "categoryId"),
      behavioralClass: str(fd, "behavioralClass") as never,
    });
  } catch {
    redirect(`/${locale}/operations?error=classify`);
  }
  redirect(`/${locale}/operations?classified=1`);
}
