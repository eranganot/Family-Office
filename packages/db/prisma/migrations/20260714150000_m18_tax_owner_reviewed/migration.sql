-- D5: owner sign-off flag on tax matrices (separate from the immutable versioned payload).
ALTER TABLE "TaxRuleSet" ADD COLUMN "ownerReviewed" BOOLEAN NOT NULL DEFAULT false;
