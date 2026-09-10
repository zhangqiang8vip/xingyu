export function visibleIslandSearchRows<T extends { slug: string }>(
  rows: T[],
  excludeSlug: string | undefined,
  query: string,
) {
  // The open article is noise in the empty "recent" list, but it remains a
  // valid result once the user has supplied a real search term.
  if (!excludeSlug || query.trim()) return rows;
  return rows.filter((row) => row.slug !== excludeSlug);
}
