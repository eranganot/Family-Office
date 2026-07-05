/** Hebrew product/account labels → canonical AccountType. Shared by all Israeli adapters. */
export const ISRAELI_PRODUCT_TYPE_MAP: Record<string, string> = {
  "קרן השתלמות": "KEREN_HISHTALMUT",
  "קופת גמל": "KUPAT_GEMEL",
  "גמל להשקעה": "GEMEL_LEHASHKAA",
  "קרן פנסיה מקיפה": "PENSION_COMPREHENSIVE",
  "קרן פנסיה כללית": "PENSION_GENERAL",
  "גמל בניהול אישי": "IRA_GEMEL",
  "IRA": "IRA_GEMEL",
  'עו"ש': "BANK_CHECKING",
  "עוש": "BANK_CHECKING",
  "חשבון עובר ושב": "BANK_CHECKING",
  "חיסכון": "BANK_SAVINGS",
  "פיקדון": "BANK_DEPOSIT",
  "תיק השקעות": "BROKERAGE_IL",
};
