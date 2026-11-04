import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "coverage/",
      "src-tauri/target/",
      "src-tauri/gen/",
      "design/",
      "tools/content/.venv/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    // The type checker covers undefined names, and this rule does not know DOM types.
    rules: { "no-undef": "off" },
  },
  // Must stay last: turns off every style rule that Prettier owns.
  prettier,
);
