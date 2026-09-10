export function attachmentCacheControl(isPublic: boolean) {
  return isPublic ? "public, max-age=0, must-revalidate" : "private, no-store";
}

export function attachmentEtagMatches(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  const normalized = etag.replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === normalized;
  });
}
