export type AttachmentReference = { url: string; markdown: string };

export function removeAttachmentReference(markdown: string, attachment: AttachmentReference) {
  const escapedUrl = escapeRegExp(attachment.url);
  const generatedLink = new RegExp(`!?\\[[^\\]]*\\]\\(${escapedUrl}(?:\\s+"[^"]*")?\\)`, "g");
  return markdown
    .replaceAll(attachment.markdown, "")
    .replace(generatedLink, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trimEnd();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
