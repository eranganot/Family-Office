// The taxonomy itself lives in @wealthos/domain (shared with the db seed path).
// Re-exported here so engine consumers have one import surface.
export {
  DEFAULT_CATEGORY_TREE,
  UNCLASSIFIED_KEY,
  flattenCategoryTree,
  type SeedCategory,
} from "@wealthos/domain";
