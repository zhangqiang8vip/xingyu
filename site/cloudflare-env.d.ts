interface Env {
  APP_ENV: "development" | "production";
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

declare namespace Cloudflare {
  interface Env {
    APP_ENV: "development" | "production";
    DB: D1Database;
    MEDIA: R2Bucket;
  }
}
