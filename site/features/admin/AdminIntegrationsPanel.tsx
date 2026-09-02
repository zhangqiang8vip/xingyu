"use client";

import { useState } from "react";
import { readApiJson } from "@/app/api-response";
import type { AdminMcpConnection, AdminMcpSession } from "./admin-types";

const SCOPE_LABELS: Record<string, string> = {
  "xingyu.read": "阅读",
  "xingyu.draft": "草稿写入",
  "xingyu.publish": "线上发布",
  offline_access: "保持登录",
};

export default function AdminIntegrationsPanel({ initial }: { initial: AdminMcpConnection[] }) {
  const [connections, setConnections] = useState(initial);
  const [message, setMessage] = useState("");

  async function revoke(connection: AdminMcpConnection, session?: AdminMcpSession) {
    const who = session?.label ?? connection.name;
    if (!window.confirm(`撤销后，${who} 必须重新完成授权才能访问星屿。确认撤销吗？`)) return;
    const response = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", clientId: connection.id, subject: session?.subject }),
    });
    const data = await readApiJson<{ connections: AdminMcpConnection[] }>(response);
    if (!response.ok) return setMessage(data.error ?? "撤销失败");
    setConnections(data.connections ?? []);
    setMessage(`${who} 已撤销`);
  }

  return <section className="admin-main admin-config-main">
    <header className="admin-header">
      <div>
        <p>AI / MCP</p>
        <h1>AI 与 MCP 连接</h1>
        <span>按客户端和每次授权查看谁连上了星屿。ChatGPT / Grok 不会把对方账号名发过来，所以用授权时间和使用记录区分。</span>
      </div>
    </header>
    <div className="config-form">
      <section className="editor-section">
        <div className="editor-section-title"><span>01</span><div><b>已登记客户端</b><small>一个客户端可以有多条授权。撤销只关掉那一次连接</small></div></div>
        {connections.map((connection) => (
          <article className="integration-card" key={connection.id}>
            <div>
              <small>{connection.kind === "legacy" ? "LEGACY TOKEN" : "OAUTH 2.1"}</small>
              <b>{connection.name}</b>
              <span>状态：{statusLabel(connection.status)}{connection.sessions.filter((session) => session.status === "connected").length > 1 ? ` · ${connection.sessions.filter((session) => session.status === "connected").length} 个有效授权` : ""}</span>
            </div>
            {connection.sessions.length === 0
              ? <small>尚未授权</small>
              : <ul className="integration-sessions">
                {connection.sessions.map((session) => <li key={`${connection.id}:${session.subject}`}>
                  <div>
                    <strong>{session.label}</strong>
                    <span>权限：{session.scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(" · ") || "尚未授权"}</span>
                    {session.scopes.includes("xingyu.publish") && <em>含线上发布权限</em>}
                    <span>授权于 {formatTime(session.grantedAt) || "未知"} · 最后使用 {formatTime(session.lastUsedAt) || "尚未使用"}</span>
                    {session.tokenCount > 0 && <span>有效令牌 {session.tokenCount} 个</span>}
                  </div>
                  {connection.kind === "oauth" && session.status === "connected"
                    ? <button type="button" onClick={() => void revoke(connection, session)}>撤销此授权</button>
                    : <small>{session.status === "revoked" ? "已撤销" : connection.kind === "legacy" ? "请通过轮换 MCP_WRITE_TOKEN 停用" : "已结束"}</small>}
                </li>)}
              </ul>}
          </article>
        ))}
      </section>
      <footer className="config-footer"><span>{message || "撤销只影响对应的那次 OAuth 授权，不会改动现有文章。"}</span></footer>
    </div>
  </section>;
}

function statusLabel(status: AdminMcpConnection["status"]) {
  if (status === "connected") return "已连接";
  if (status === "revoked") return "已撤销";
  return "未连接";
}

function formatTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
