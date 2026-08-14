"use client";

import { FormEvent, useState } from "react";
import { readApiJson } from "../../api-response";

export default function AdminLoginForm({ returnTo = "" }: { returnTo?: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await readApiJson<Record<string, never>>(response);
    if (!response.ok) { setError(data.error ?? "登录失败"); setLoading(false); return; }
    window.location.replace(returnTo || "/admin");
  }

  return <form className="admin-login-form" onSubmit={submit}>
    <label htmlFor="admin-password">管理员密码</label>
    <input id="admin-password" type="password" autoComplete="current-password" required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入管理员密码" />
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={loading}>{loading ? "正在验证…" : "进入写作后台"}</button>
  </form>;
}
