import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "src-tauri", "coverage"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  { files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"], languageOptions: { globals: globals.browser } },
  { files: ["*.{js,ts}"], languageOptions: { globals: globals.node } },
]);
