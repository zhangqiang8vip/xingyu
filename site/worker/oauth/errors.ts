export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly status: number,
    readonly description?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(description ?? error);
  }
}

export function oauthJson(error: OAuthError) {
  return Response.json(
    { error: error.error, ...(error.description ? { error_description: error.description } : {}) },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...error.headers,
      },
    },
  );
}

export function oauthLog(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() }));
}
