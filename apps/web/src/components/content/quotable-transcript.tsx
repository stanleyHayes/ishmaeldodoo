"use client";

import { useRef, useState } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";

type CitationFormat = "plain" | "journalistic" | "academic";

function cleanSelection(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_500);
}

function citation(
  format: CitationFormat,
  quote: string,
  item: Readonly<{
    speakerName: string;
    title: string;
    type: string;
    venue?: string;
    city?: string;
    date: Date;
    url: string;
    locale: SupportedLocale;
  }>,
): string {
  const place = [item.venue, item.city].filter(Boolean).join(", ");
  const date = item.date.toLocaleDateString(item.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  if (format === "plain")
    return `“${quote}” — ${item.speakerName}, ${item.title}${place ? `, ${place}` : ""}, ${date}. ${item.url}`;
  if (format === "journalistic")
    return `“${quote},” ${item.speakerName} said in “${item.title}”${place ? ` at ${place}` : ""} on ${date}. ${item.url}`;
  return `${item.speakerName}. (${item.date.getUTCFullYear()}, ${item.date.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${item.date.getUTCDate()}). ${item.title} [${item.type}].${place ? ` ${place}.` : ""} ${item.url} Quoted passage: “${quote}”`;
}

export function QuotableTranscript({
  transcript,
  transcriptStatus,
  speakerName,
  title,
  type,
  venue,
  city,
  date,
  url,
  locale,
}: Readonly<{
  transcript: string;
  transcriptStatus: "machine" | "corrected";
  speakerName?: string;
  title: string;
  type: string;
  venue?: string;
  city?: string;
  date: Date;
  url: string;
  locale: SupportedLocale;
}>) {
  const french = locale === "fr-FR";
  const transcriptRef = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState("");
  const [status, setStatus] = useState("");

  function captureSelection() {
    const selected = window.getSelection();
    if (!selected || selected.rangeCount === 0 || selected.isCollapsed) {
      setSelection("");
      return;
    }
    const range = selected.getRangeAt(0);
    if (!transcriptRef.current?.contains(range.commonAncestorContainer)) {
      setSelection("");
      return;
    }
    setSelection(cleanSelection(selected.toString()));
    setStatus("");
  }

  async function copy(format: CitationFormat) {
    if (!speakerName || !selection) return;
    try {
      await navigator.clipboard.writeText(
        citation(format, selection, {
          speakerName,
          title,
          type,
          ...(venue ? { venue } : {}),
          ...(city ? { city } : {}),
          date,
          url,
          locale,
        }),
      );
      setStatus(french ? "Citation copiée." : "Citation copied.");
    } catch {
      setStatus(
        french
          ? "La copie a échoué. Autorisez le presse-papiers et réessayez."
          : "Copy failed. Allow clipboard access and try again.",
      );
    }
  }

  return (
    <div className="quotable-transcript">
      <p
        ref={transcriptRef}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        tabIndex={0}
      >
        {transcript}
      </p>
      {transcriptStatus === "machine" ? (
        <p className="citation-caution">
          {french
            ? "Transcription automatique non corrigée — vérifiez l’audio avant de citer."
            : "Uncorrected machine transcript — verify against the media before quoting."}
        </p>
      ) : null}
      {selection ? (
        speakerName ? (
          <div
            className="citation-copy"
            role="group"
            aria-label={
              french
                ? "Copier la citation sélectionnée"
                : "Copy selected citation"
            }
          >
            <p>“{selection}”</p>
            <button type="button" onClick={() => void copy("plain")}>
              {french ? "Texte simple" : "Plain"}
            </button>
            <button type="button" onClick={() => void copy("journalistic")}>
              {french ? "Journalistique" : "Journalistic"}
            </button>
            <button type="button" onClick={() => void copy("academic")}>
              {french ? "Académique" : "Academic"}
            </button>
          </div>
        ) : (
          <p className="citation-caution">
            {french
              ? "La citation est indisponible tant que l’identité canonique n’est pas publiée."
              : "Citation copying is unavailable until canonical identity is published."}
          </p>
        )
      ) : (
        <p className="citation-hint">
          {french
            ? "Sélectionnez un passage pour copier une citation exacte."
            : "Select a passage to copy an accurate citation."}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
