import type { Document, PrismaClient } from "@prisma/client";

export interface CreateDocumentInput {
  sha256: string;
  filename: string;
  mimeType: string;
  docType?: string | undefined;
  institutionName?: string | undefined;
  storageKey: string;
}

export const documentsRepo = {
  async findBySha(db: PrismaClient, sha256: string): Promise<Document | null> {
    return db.document.findUnique({ where: { sha256 } });
  },

  async create(db: PrismaClient, householdId: string, input: CreateDocumentInput): Promise<Document> {
    let institutionId: string | null = null;
    if (input.institutionName) {
      const inst = await db.institution.upsert({
        where: { name_country: { name: input.institutionName, country: "IL" } },
        create: { name: input.institutionName, country: "IL", type: "OTHER" },
        update: {},
      });
      institutionId = inst.id;
    }
    return db.document.create({
      data: {
        householdId,
        sha256: input.sha256,
        filename: input.filename,
        mimeType: input.mimeType,
        docType: input.docType ?? null,
        institutionId,
        storageKey: input.storageKey,
      },
    });
  },

  list(db: PrismaClient, householdId: string): Promise<Document[]> {
    return db.document.findMany({
      where: { householdId },
      include: { institution: true, batches: { orderBy: { startedAt: "desc" } } } as never,
      orderBy: { uploadedAt: "desc" },
    });
  },

  get(db: PrismaClient, id: string) {
    return db.document.findUnique({
      where: { id },
      include: { institution: true, batches: { orderBy: { startedAt: "desc" } } },
    });
  },

  setParseStatus(db: PrismaClient, id: string, status: "PARSED" | "PARTIALLY_PARSED" | "FAILED" | "NOT_PARSEABLE") {
    return db.document.update({ where: { id }, data: { parseStatus: status } });
  },
};
