import path from "node:path";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

const projectRoot = import.meta.dirname;
const testFiles = "src/**/*.test.{ts,tsx}";

const visibleAttribute =
  "JSXAttribute[name.name=/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|alt|placeholder|title)$/]";
const visibleText =
  ":matches(Literal[value=/\\S/], TemplateLiteral:has(TemplateElement[value.raw=/\\S/]))";
const visibleAttributeLiteralSelectors = [
  `${visibleAttribute} > Literal[value=/\\S/]`,
  `${visibleAttribute} > JSXExpressionContainer > ${visibleText}`,
  `${visibleAttribute} > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression, BinaryExpression) > ${visibleText}`,
].map((selector) => ({
  selector,
  message: "User-visible attribute text must come from the i18n catalogs.",
}));

const layer = (type) => ({ element: { type } });
const layers = (...types) => types.map(layer);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: projectRoot },
      "import/resolver": {
        typescript: { project: path.join(projectRoot, "tsconfig.json") },
      },
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: projectRoot,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports" },
      ],
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": projectRoot,
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain", partialMatch: false },
        { type: "application", pattern: "src/application", partialMatch: false },
        { type: "infra", pattern: "src/infra", partialMatch: false },
        { type: "app", pattern: "src/app", partialMatch: false },
        { type: "features", pattern: "src/features", partialMatch: false },
        { type: "components", pattern: "src/components", partialMatch: false },
        { type: "lib", pattern: "src/lib", partialMatch: false },
        { type: "i18n", pattern: "src/i18n", partialMatch: false },
      ],
      "boundaries/files": [{ category: "test", pattern: testFiles }],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkAllOrigins: true,
          checkUnknownLocals: true,
          policies: [
            { allow: { to: { module: { origin: ["external", "core"] } } } },
            { from: layer("domain"), allow: { to: layer("domain") } },
            {
              from: layer("domain"),
              disallow: {
                to: [
                  { module: { origin: "external", source: ["react", "react-dom", "next"] } },
                  { module: { origin: "core" } },
                ],
              },
            },
            { from: layer("application"), allow: { to: layers("domain", "application") } },
            { from: layer("infra"), allow: { to: layers("domain", "application", "infra") } },
            {
              from: layer("app"),
              allow: { to: [{ element: { type: "*" } }, { element: { isUnknown: true } }] },
            },
            {
              from: layer("features"),
              allow: { to: layers("domain", "features", "components", "lib") },
            },
            {
              from: layer("features"),
              allow: { to: layer("application"), dependency: { kind: "type" } },
            },
            { from: layer("components"), allow: { to: layers("components", "lib") } },
            {
              from: layer("components"),
              allow: { to: layer("domain"), dependency: { kind: "type" } },
            },
            { from: layer("lib"), allow: { to: layer("lib") } },
            { from: layer("i18n"), allow: { to: layers("i18n", "lib") } },
            {
              from: { file: { categories: "test" } },
              allow: {
                to: [
                  { module: { origin: "core" } },
                  { element: { isUnknown: true }, module: { origin: "local" } },
                ],
              },
            },
            {
              from: { file: { categories: "test" } },
              allow: {
                to: { element: { type: "i18n" }, file: { path: "src/i18n/messages/*.json" } },
              },
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [`${projectRoot.split(path.sep).join("/")}/${testFiles}`],
          optionalDependencies: false,
          peerDependencies: false,
          includeTypes: true,
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/utils.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "cn",
              message: "Import cn from @/lib/utils so the class merging engine stays swappable.",
            },
          ],
          patterns: [
            {
              group: ["cn/*"],
              message: "Import cn from @/lib/utils so the class merging engine stays swappable.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    ignores: [testFiles],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      "no-restricted-syntax": ["error", ...visibleAttributeLiteralSelectors],
    },
  },
  {
    rules: {
      eqeqeq: "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "_prova/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
