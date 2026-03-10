import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/app/api/chat/route.ts",
      "src/app/api/notion/schema/route.ts",
      "src/app/api/notion/task-assigned/route.ts",
      "src/lib/agent-notes.ts",
      "src/lib/agents/load-balancer.ts",
      "src/lib/agents/triage.ts",
      "src/lib/brand-operator.ts",
      "src/lib/news-signals.ts",
      "src/lib/notion-client.ts",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
