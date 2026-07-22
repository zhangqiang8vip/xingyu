export type ApiPayload<T> = T & { error?: string };

/** Response.json is unknown under Worker types; keep the assertion at one API boundary. */
export function readApiJson<T>(response: Response): Promise<ApiPayload<T>> {
  return response.json() as Promise<ApiPayload<T>>;
}
