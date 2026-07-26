import { desc } from "drizzle-orm";
import { getDb } from ".";
import { ensureDatabase } from "./bootstrap";
import { mcpActivity } from "./schema";

export type McpActivityAction =
  | "create_draft"
  | "update_post"
  | "update_page"
  | "publish_post"
  | "unpublish_post"
  | "create_space"
  | "update_space"
  | "move_space"
  | "delete_space";

type ActivityInput = {
  action: McpActivityAction;
  post: {
    id: number;
    publicId: string;
    title: string;
    status: string;
  };
  beforeStatus?: string | null;
  changedFields: string[];
  summary: string;
  clientLabel: string;
};

export async function recordMcpActivity(input: ActivityInput) {
  await ensureDatabase();
  const [activity] = await getDb().insert(mcpActivity).values({
    action: input.action,
    postId: input.post.id,
    publicId: input.post.publicId,
    title: input.post.title,
    beforeStatus: input.beforeStatus ?? null,
    afterStatus: input.post.status,
    changedFields: JSON.stringify(input.changedFields),
    summary: input.summary,
    clientLabel: input.clientLabel,
  }).returning({ id: mcpActivity.id, createdAt: mcpActivity.createdAt });
  return activity;
}

export async function recordMcpPageActivity(input: {
  slug: string;
  title: string;
  changedFields: string[];
  summary: string;
  clientLabel: string;
}) {
  await ensureDatabase();
  const [activity] = await getDb().insert(mcpActivity).values({
    action: "update_page",
    postId: 0,
    publicId: `page:${input.slug}`,
    title: input.title,
    beforeStatus: "published",
    afterStatus: "published",
    changedFields: JSON.stringify(input.changedFields),
    summary: input.summary,
    clientLabel: input.clientLabel,
  }).returning({ id: mcpActivity.id, createdAt: mcpActivity.createdAt });
  return activity;
}

export async function recordMcpSpaceActivity(input: {
  action: Extract<McpActivityAction, "create_space" | "update_space" | "move_space" | "delete_space">;
  space: { id: number; name: string };
  beforeParentId?: number | null;
  afterParentId?: number | null;
  changedFields: string[];
  summary: string;
  clientLabel: string;
}) {
  await ensureDatabase();
  const [activity] = await getDb().insert(mcpActivity).values({
    action: input.action,
    postId: input.space.id,
    publicId: `space:${input.space.id}`,
    title: input.space.name,
    beforeStatus: input.beforeParentId === undefined ? null : `parent:${input.beforeParentId ?? "root"}`,
    afterStatus: input.afterParentId === undefined ? null : `parent:${input.afterParentId ?? "root"}`,
    changedFields: JSON.stringify(input.changedFields),
    summary: input.summary,
    clientLabel: input.clientLabel,
  }).returning({ id: mcpActivity.id, createdAt: mcpActivity.createdAt });
  return activity;
}

export async function listMcpActivity(limit: number) {
  await ensureDatabase();
  const rows = await getDb().select().from(mcpActivity)
    .orderBy(desc(mcpActivity.createdAt), desc(mcpActivity.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resource_type: row.publicId.startsWith("page:")
      ? "page"
      : row.publicId.startsWith("space:")
        ? "space"
        : "post",
    public_id: row.publicId,
    title: row.title,
    before_status: row.beforeStatus,
    after_status: row.afterStatus,
    changed_fields: parseChangedFields(row.changedFields),
    summary: row.summary,
    client: row.clientLabel,
    created_at: row.createdAt,
  }));
}

function parseChangedFields(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}
