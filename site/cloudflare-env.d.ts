interface SubtleCrypto {
  timingSafeEqual(a: BufferSource, b: BufferSource): boolean;
}

interface ImagesBinding {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality?: number }): Promise<{ response(options?: { headers?: HeadersInit }): Response }>;
    };
  };
}

interface Env {
  APP_ENV: "development" | "production";
  MCP_WRITE_TOKEN?: string;
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  IMAGES: ImagesBinding;
}

declare namespace Cloudflare {
  interface Env {
    APP_ENV: "development" | "production";
    MCP_WRITE_TOKEN?: string;
    DB: D1Database;
    MEDIA: R2Bucket;
    IMAGES?: ImagesBinding;
  }
}
