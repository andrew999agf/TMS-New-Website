import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, minified static assets (e.g. the Silero VAD AudioWorklet).
    "public/**",
  ]),
  {
    rules: {
      // Typographic apostrophes in copy are intentional; allow plain quotes.
      "react/no-unescaped-entities": "off",
      // We sync from matchMedia/scroll in effects deliberately (SSR-safe init).
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
