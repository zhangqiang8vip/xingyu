import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Avatars are administrator-managed local/R2 URLs, so raw img elements avoid
      // an image-proxy dependency while preserving immediate preview updates.
      "@next/next/no-img-element": "off",
      // The admin route scopes a large prebuilt editor stylesheet; importing it
      // would duplicate Vditor's entire asset tree in the deployment output.
      "@next/next/no-css-tags": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vinext/**",
    "dist/**",
    "out/**",
    "build/**",
    "public/vditor/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
