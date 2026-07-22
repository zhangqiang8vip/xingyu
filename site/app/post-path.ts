type PublicPostReference = { publicId: string; slug: string };

export function postPath(post: PublicPostReference) {
  return `/posts/${encodeURIComponent(post.publicId)}/${encodeURIComponent(post.slug)}`;
}
