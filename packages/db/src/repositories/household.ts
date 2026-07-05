import type { FamilyMember, Household, MemberRole, Prisma, PrismaClient } from "@prisma/client";
import { compact, type PatchOf } from "../util";

export type HouseholdWithMembers = Household & { members: FamilyMember[] };

export interface BootstrapHouseholdInput {
  name: string;
  baseCurrency: string;
  locale: string;
  timezone: string;
}

export interface MemberInput {
  name: string;
  role: MemberRole;
  birthDate?: Date | undefined;
  taxResidency: string;
  employmentStatus?: string | undefined;
}

export const householdRepo = {
  get(db: PrismaClient): Promise<HouseholdWithMembers | null> {
    return db.household.findFirst({
      include: { members: { where: { archivedAt: null }, orderBy: { birthDate: "asc" } } },
    });
  },

  /** Single-household invariant: bootstrap refuses to create a second household. */
  async bootstrap(db: PrismaClient, input: BootstrapHouseholdInput): Promise<HouseholdWithMembers> {
    return db.$transaction(async (tx) => {
      const existing = await tx.household.findFirst({ select: { id: true } });
      if (existing) throw new Error("HOUSEHOLD_ALREADY_EXISTS");
      const created = await tx.household.create({ data: input });
      return { ...created, members: [] };
    });
  },

  update(db: PrismaClient, id: string, patch: PatchOf<BootstrapHouseholdInput>): Promise<Household> {
    return db.household.update({ where: { id }, data: compact(patch) as Prisma.HouseholdUpdateInput });
  },

  addMember(db: PrismaClient, householdId: string, input: MemberInput): Promise<FamilyMember> {
    return db.familyMember.create({
      data: { householdId, ...input, birthDate: input.birthDate ?? null, employmentStatus: input.employmentStatus ?? null },
    });
  },

  updateMember(db: PrismaClient, id: string, patch: PatchOf<MemberInput>): Promise<FamilyMember> {
    return db.familyMember.update({
      where: { id },
      data: compact(patch) as Prisma.FamilyMemberUpdateInput,
    });
  },

  archiveMember(db: PrismaClient, id: string): Promise<FamilyMember> {
    return db.familyMember.update({ where: { id }, data: { archivedAt: new Date() } });
  },
};
