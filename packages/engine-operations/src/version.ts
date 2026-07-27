/**
 * Operations engine version. Bumped on ANY change that can alter a computed
 * figure (classification rules, normalisation, surplus formula, health score).
 * Frozen into OperatingPeriod.engineVersion at close, so a closed month is
 * always reproducible from its snapshot + this version + its assumption pins.
 */
export const OPERATIONS_ENGINE_VERSION = "operations@0.1.0-m36";
