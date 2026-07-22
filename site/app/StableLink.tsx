"use client";

import Link from "next/link";
import { ComponentProps } from "react";

export default function StableLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} scroll={false} data-route-transition="none" />;
}
