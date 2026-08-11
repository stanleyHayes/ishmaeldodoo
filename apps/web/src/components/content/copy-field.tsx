"use client";

import { useEffect, useRef, useState } from "react";

export function CopyField({
  label,
  value,
  locale,
}: Readonly<{ label: string; value: string; locale: "en-GB" | "fr-FR" }>) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        setCopied(false);
        resetTimer.current = null;
      }, 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="copy-field">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <button type="button" onClick={() => void copy()}>
        {copied
          ? locale === "fr-FR"
            ? "Copié"
            : "Copied"
          : locale === "fr-FR"
            ? "Copier"
            : "Copy"}
      </button>
    </div>
  );
}
