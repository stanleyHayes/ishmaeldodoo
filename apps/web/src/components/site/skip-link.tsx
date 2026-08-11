"use client";

import type { MouseEvent } from "react";

export function SkipLink({ label }: Readonly<{ label: string }>) {
  function skip(event: MouseEvent<HTMLAnchorElement>): void {
    const target = document.getElementById("main-content");
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
    window.history.replaceState(null, "", "#main-content");
  }

  return (
    <a className="skip-link" href="#main-content" onClick={skip}>
      {label}
    </a>
  );
}
