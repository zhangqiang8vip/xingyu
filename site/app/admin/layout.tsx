import type { ReactNode } from "react";

/** Vditor is admin-only; public readers should not download its stylesheet. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <><link rel="stylesheet" href="/vditor/dist/index.css" />{children}</>;
}
