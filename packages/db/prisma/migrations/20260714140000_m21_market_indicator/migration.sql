-- M21 (B6/C5): store fetched market indicators (BOI policy rate now; CPI/mortgage-avg later).
CREATE TABLE "MarketIndicator" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(12,6) NOT NULL,
    "asOf" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIndicator_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketIndicator_key_asOf_source_key" ON "MarketIndicator"("key", "asOf", "source");
