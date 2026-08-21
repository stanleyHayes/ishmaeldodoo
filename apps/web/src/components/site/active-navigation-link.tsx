"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function normalisePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function routeIsActive(pathname: string, href: string): boolean {
  const current = normalisePathname(pathname);
  const destination = normalisePathname(href);
  return current === destination || current.startsWith(`${destination}/`);
}

export function ActiveNavigationLink({
  href,
  initialPathname,
  drawerToggleId,
  children,
}: Readonly<{
  href: string;
  initialPathname: string;
  drawerToggleId?: string;
  children: ReactNode;
}>) {
  const clientPathname = usePathname();
  const pathname = clientPathname || initialPathname;

  return (
    <Link
      href={href}
      aria-current={routeIsActive(pathname, href) ? "page" : undefined}
      onClick={() => {
        if (!drawerToggleId) return;
        const toggle = document.getElementById(drawerToggleId);
        if (toggle instanceof HTMLInputElement && toggle.type === "checkbox") {
          toggle.checked = false;
        }
      }}
    >
      {children}
    </Link>
  );
}
