import { getTranslations } from "next-intl/server";
import type { Locale } from "@wealthos/i18n";
import { Explainer, SuccessBanner } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { CategoryTreeSection, type FlatCategory } from "../operations/sections/category-tree";
import { ImportSection } from "../operations/sections/import-statements";
import { ManualAddSection } from "../operations/sections/manual-add";
import { OperationsNav } from "../operations/sections/operations-nav";
import { SuspenseQueueSection } from "../operations/sections/suspense-queue";
import { TransactionListSection } from "../operations/sections/transaction-list";
import type { PickerCategory } from "../../../../components/operations/category-picker";

/**
 * M42b — `/transactions`. A TOP-LEVEL destination, not an Operations tab.
 *
 * Owner decision, 2026-07-29: these belong on a completely different page from the
 * day-to-day workspace, because you come here for a different reason than running the
 * month. They are also one subject rather than four:
 *
 *   the LIST      the raw rows
 *   the TREE      the scheme that classifies them
 *   SUSPENSE      the rows the scheme could not classify
 *   MANUAL ADD    a row created by hand, which lands in all three
 *
 * Splitting those across pages would be the actual mistake. Import feeds them too and is
 * headed for the Mapping page, which already owns the rest of ingestion.
 *
 * This deviates from doc 07 §9.1, which specced these as sections under `operations/`.
 * Recorded deliberately in STATUS.md.
 */

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    cat?: string;
    beh?: string;
    edit?: string;
    void?: string;
    created?: string;
    classified?: string;
    categorySaved?: string;
    updated?: string;
    removed?: string;
    restored?: string;
    dupesRemoved?: string;
    // Import outcomes, moved here with the importer itself.
    preview?: string;
    imported?: string;
    dupes?: string;
    uploaded?: string;
    failed?: string;
    reused?: string;
    skipped?: string;
    undone?: string;
    reset?: string;
    docs?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const loc = locale as Locale;
  const trpc = await serverCaller();

  // Seeds the default tree on first read — idempotent.
  const cats = await trpc.operations.categories.tree();
  const { rows: txns } = await trpc.operations.transactions.list({
    limit: 50,
    ...(sp.cat ? { categoryId: sp.cat } : {}),
    ...(sp.beh ? { behavioralClass: sp.beh as never } : {}),
  });
  const dupes = await trpc.operations.transactions.duplicates().catch(() => null);
  const suspense = await trpc.operations.suspense.queue({ limit: 25 });

  /*
   * Preview is a mutation (it does real parsing work) but persists nothing.
   * NEVER swallow this: a silent catch renders an empty card and looks like the feature
   * simply does not exist. Surface the reason instead.
   */
  let preview: Awaited<ReturnType<typeof trpc.operations.import.preview>> | null = null;
  let previewError: string | null = null;
  if (sp.preview) {
    try {
      preview = await trpc.operations.import.preview({ documentId: sp.preview });
    } catch (e) {
      previewError = e instanceof Error ? e.message : "PREVIEW_FAILED";
    }
  }
  const pending = await trpc.operations.import.pending().catch(() => []);
  const batches = await trpc.operations.import.batches().catch(() => []);

  const flat = cats.flat as unknown as FlatCategory[];
  const byId = new Map(flat.map((c) => [c.id, c]));
  const pickerCats = cats.flat as unknown as PickerCategory[];
  const today = new Date().toISOString().slice(0, 10);
  const baseCurrency = "ILS";

  return (
    <div className="flex flex-col gap-6">
      {/*
        Same sub-nav as the Operations routes: this page is reached from that row, even
        though its URL is top-level. The owner should not have to know which of these
        happens to be a sub-route.
      */}
      <OperationsNav locale={locale} active="transactions" />

      <Explainer
        title={t("transactionsExplainer.title")}
        paragraphs={[t("transactionsExplainer.p1"), t("transactionsExplainer.p2")]}
      />

      <SuccessBanner
        message={
          sp.created ? t("created")
          : sp.classified ? t("classified")
          : sp.categorySaved ? t("categorySaved")
          : sp.updated ? t("updatedOk")
          : sp.removed ? t("removedOk")
          : sp.restored ? t("restoredOk")
          : sp.dupesRemoved ? t("dupesRemovedOk", { n: sp.dupesRemoved })
          : sp.undone ? t("undoneOk", { n: sp.undone })
          : sp.reset ? t("resetOk", { n: sp.reset, docs: sp.docs ?? "0" })
          : sp.imported
            ? sp.skipped && sp.skipped !== "0"
              ? t("importedSome", { n: sp.imported, dupes: sp.dupes ?? "0", skipped: sp.skipped })
              : t("importedOk", { n: sp.imported, dupes: sp.dupes ?? "0" })
          : undefined
        }
      />

      {/*
        Import leads: it is what FEEDS everything below it. A row it creates lands in the
        list, under the tree, and possibly in the suspense queue — so importing on one
        page and discovering the consequences on another was the wrong split.
      */}
      <ImportSection
        locale={locale}
        pending={pending}
        batches={batches}
        preview={preview}
        previewError={previewError}
        previewingId={sp.preview}
        uploadedCount={sp.uploaded}
        failedCount={sp.failed}
        reusedCount={sp.reused}
      />

      {/*
        Suspense first, deliberately. Every closed month in this household is
        `provisional` because of unverified rows — that is what caveats the surplus, what
        makes the allocation hand-off refuse, and what weakened the M41 drift baseline.
        Clearing this queue is the highest-value recurring action here, so it is not
        filed below the list of rows it is about.
      */}
      <SuspenseQueueSection suspense={suspense} pickerCats={pickerCats} locale={locale} loc={loc} />

      <TransactionListSection
        txns={txns}
        flat={flat}
        pickerCats={pickerCats}
        byId={byId}
        dupes={dupes}
        locale={locale}
        loc={loc}
        baseCurrency={baseCurrency}
        filterCat={sp.cat}
        filterBeh={sp.beh}
        editingId={sp.edit}
        showVoided={sp.void === "1"}
      />

      <ManualAddSection pickerCats={pickerCats} locale={locale} today={today} />

      <CategoryTreeSection flat={flat} pickerCats={pickerCats} locale={locale} />
    </div>
  );
}
