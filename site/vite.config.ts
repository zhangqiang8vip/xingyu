import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const PRODUCTION_PREVIEW_DATABASE_ID =
  "00000000-0000-4000-8000-000000000001";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async ({ command, mode }) => {
  const appEnvironment = command === "build" || mode === "production" ? "production" : "development";
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      APP_ENV: appEnvironment,
      ...(process.env.MCP_WRITE_TOKEN ? { MCP_WRITE_TOKEN: process.env.MCP_WRITE_TOKEN } : {}),
    },
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: appEnvironment === "development" ? "xingyu-development" : "xingyu-production-preview",
            database_id: appEnvironment === "development"
              ? SITE_CREATOR_PLACEHOLDER_DATABASE_ID
              : PRODUCTION_PREVIEW_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: appEnvironment === "development" ? "xingyu-development-media" : "xingyu-production-preview-media",
          },
        ]
      : [],
  };

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "127.0.0.1",
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
