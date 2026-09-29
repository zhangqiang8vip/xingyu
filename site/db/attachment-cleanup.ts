export class AttachmentCleanupRequiredError extends Error {
  readonly publicId: string;
  readonly objectKey: string;

  constructor(publicId: string, objectKey: string, cause: unknown) {
    super(`附件存储清理未完成，请记录附件 ID ${publicId} 并联系管理员`, { cause });
    this.name = "AttachmentCleanupRequiredError";
    this.publicId = publicId;
    this.objectKey = objectKey;
  }
}

export async function cleanupFailedAttachmentUpload(
  store: { delete(key: string): Promise<void> },
  publicId: string,
  objectKey: string,
  writeError: unknown,
) {
  try {
    await store.delete(objectKey);
  } catch (cleanupError) {
    console.error(JSON.stringify({
      event: "attachment_object_cleanup_required",
      publicId,
      objectKey,
      writeErrorType: writeError instanceof Error ? writeError.name : typeof writeError,
      cleanupErrorType: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
    }));
    throw new AttachmentCleanupRequiredError(publicId, objectKey, writeError);
  }
}
