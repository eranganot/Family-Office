"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, ownership, str } from "./form-helpers";

export async function uploadDocumentAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/${locale}/documents?error=NO_FILE`);
  const bytes = Buffer.from(await (file as File).arrayBuffer());
  const trpc = await serverCaller();
  try {
    await trpc.documents.upload({
      filename: (file as File).name,
      mimeType: (file as File).type || "application/octet-stream",
      docType: opt(fd, "docType") as never,
      institutionName: opt(fd, "institutionName"),
      contentBase64: bytes.toString("base64"),
    });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/documents?error=${code}`);
  }
  redirect(`/${locale}/documents`);
}

export async function runImportAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const documentId = str(fd, "documentId");
  const trpc = await serverCaller();
  let batchId: string | undefined;
  try {
    const report = await trpc.imports.run({ documentId, defaultOwnership: ownership(fd) });
    batchId = report.batchId;
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/documents?error=${code}`);
  }
  redirect(`/${locale}/documents?report=${batchId}`);
}
