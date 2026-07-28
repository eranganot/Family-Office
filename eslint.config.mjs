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
      /**
       * WITHOUT a resolver, `@wealthos/x` is treated as an EXTERNAL package and the
       * dependency matrix below never fires — which is what made these rules silently
       * non-enforcing despite doc 04 claiming CI fails on violation.
       * The bundled `eslint-import-resolver-node` cannot do it: our workspace packages
       * expose only an `exports` map ("./src/index.ts") with no `main`, and
       * resolver-node 0.3.9 does not read `exports`. A TypeScript-aware resolver does.
       */
      "import/resolver": {
        typescript: {
          project: ["tsconfig.json", "packages/*/tsconfig.json", "apps/*/tsconfig.json"],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // eslint-plugin-boundaries v6 object selectors. The v5 string form still works
          // but prints a deprecation warning on every lint run, and warnings people are
          // trained to ignore are how real violations get ignored too.
          rules: [
            { from: [{ type: "domain" }], allow: [{ to: [{ type: "domain" }] }] },
            { from: [{ type: "db" }], allow: [{ to: [{ type: ["db", "domain"] }] }] },
            { from: [{ type: "registry" }], allow: [{ to: [{ type: ["registry", "domain", "db"] }] }] },
            { from: [{ type: "ingestion" }], allow: [{ to: [{ type: ["ingestion", "domain"] }] }] },
            { from: [{ type: "engine" }], allow: [{ to: [{ type: ["engine", "domain", "db", "registry"] }] }] },
            {
              from: [{ type: "api" }],
              allow: [{ to: [{ type: ["api", "domain", "db", "registry", "engine", "ingestion"] }] }],
            },
            { from: [{ type: "i18n" }], allow: [{ to: [{ type: "i18n" }] }] },
            { from: [{ type: "web" }], allow: [{ to: [{ type: ["web", "api", "i18n", "domain"] }] }] },
            {
              // `api` added deliberately: the worker is an application-level caller of the
              // same services the web app uses (runMonitoringCycle, refreshFxFromBoi). Doc 04
              // predates those services living in `api`. The alternative — moving them into an
              // engine — is a real option but a larger refactor; recorded in STATUS.md.
              from: [{ type: "worker" }],
              allow: [{ to: [{ type: ["worker", "api", "ingestion", "engine", "db", "registry", "domain"] }] }],
            },
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
