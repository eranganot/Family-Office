-- M16b: tax-year utilization tracker needs contribution cash-flow types so
-- "deposited vs ceiling" is measured from mapped deposits (never inferred).
ALTER TYPE "CashFlowType" ADD VALUE 'HISHTALMUT_CONTRIBUTION';
ALTER TYPE "CashFlowType" ADD VALUE 'PENSION_CONTRIBUTION';
