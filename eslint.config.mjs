import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default [
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "worker/worker-configuration.d.ts",
    ],
  },
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.astro/*.ts"],
    languageOptions: {
      parserOptions: {
        project: null,
        projectService: {
          allowDefaultProject: [
            "src/components/*.astro/*.ts",
            "src/pages/*.astro/*.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    files: ["src/**/*.astro"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        project: true,
        extraFileExtensions: [".astro"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    files: [
      "src/**/*.ts",
      "worker/*.ts",
      "tests/visual/**/*.ts",
      "playwright.config.ts",
    ],
    ignores: ["**/*.test.ts", "**/*.astro/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
];
