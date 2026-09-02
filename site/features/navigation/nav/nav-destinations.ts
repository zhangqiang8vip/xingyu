export type NavCurrent = "home" | "archive" | "connect" | "about";

export const NAV_DESTINATIONS = [
  { id: "home" as const, href: "/", label: "首页" },
  { id: "archive" as const, href: "/archive", label: "文章" },
  { id: "connect" as const, href: "/connect", label: "接入" },
  { id: "about" as const, href: "/about", label: "关于" },
] as const;
