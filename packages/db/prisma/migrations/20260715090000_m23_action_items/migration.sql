-- M23c: computed action checklists per recommendation ({en:[],he:[]}); null on pre-M23 rows
ALTER TABLE "Recommendation" ADD COLUMN "actionItems" JSONB;
