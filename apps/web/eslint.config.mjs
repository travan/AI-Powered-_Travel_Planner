import base from "@travel/config/eslint/base";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  ...base,
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "off",
      "@next/next/google-font-display": "off",
      "@next/next/no-page-custom-font": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        process: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];
