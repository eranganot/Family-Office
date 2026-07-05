// Root flat config. The boundaries rules ARE the architecture (doc 04 dependency matrix):
// arrows only point downward; domain imports nothing but zod/decimal.js.
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.turbo/**", "**/*.config.*", "apps/web/next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx", "apps/**/*.ts", "apps/**/*.tsx"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "domain", pattern: "packages/domain/**" },
        { type: "db", pattern: "packages/db/**" },
        { type: "registry", pattern: "packages/registry/**" },
        { type: "ingestion", pattern: "packages/ingestion/**" },
        { type: "engine", pattern: "packages/engine-*/**" },
        { type: "api", pattern: "packages/api/**" },
        { type: "i18n", pattern: "packages/i18n/**" },
        { type: "web", pattern: "apps/web/**" },
        { type: "worker", pattern: "apps/worker/**" },
      ],
      "boundaries/dependency-nodes": ["import"],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "domain", allow: ["domain"] },
            { from: "db", allow: ["db", "domain"] },
            { from: "registry", allow: ["registry", "domain", "db"] },
            { from: "ingestion", allow: ["ingestion", "domain"] },
            { from: "engine", allow: ["engine", "domain", "db", "registry"] },
            { from: "api", allow: ["api", "domain", "db", "registry", "engine", "ingestion"] },
            { from: "i18n", allow: ["i18n"] },
            { from: "web", allow: ["web", "api", "i18n", "domain"] },
            { from: "worker", allow: ["worker", "ingestion", "engine", "db", "registry", "domain"] },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The purity rule: domain may import only zod and decimal.js from the outside world.
    files: ["packages/domain/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(?!zod$|decimal\\.js$|\\.{1,2}/)", message: "packages/domain imports only zod, decimal.js, and relative files" }] },
      ],
    },
  },
);
