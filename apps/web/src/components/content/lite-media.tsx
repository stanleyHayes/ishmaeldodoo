"use client";

import Image from "next/image";
import { useState } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function LiteImage({
  src,
  alt,
  width,
  height,
  locale,
  lite,
}: Readonly<{
  src: string;
  alt: string;
  width: number;
  height: number;
  locale: SupportedLocale;
  lite: boolean;
}>) {
  const [loaded, setLoaded] = useState(!lite);
  if (!loaded)
    return (
      <div className="lite-media-placeholder">
        <p>{alt}</p>
        <button type="button" onClick={() => setLoaded(true)}>
          {locale === "fr-FR" ? "Charger l’image" : "Load image"}
        </button>
      </div>
    );
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes="(max-width: 48rem) 100vw, 33vw"
    />
  );
}

export function LiteAudio({
  src,
  transcript,
  locale,
  lite,
}: Readonly<{
  src: string;
  transcript: string;
  locale: SupportedLocale;
  lite: boolean;
}>) {
  const [loaded, setLoaded] = useState(!lite);
  if (!loaded)
    return (
      <div className="lite-audio-placeholder">
        <p>{transcript}</p>
        <button type="button" onClick={() => setLoaded(true)}>
          {locale === "fr-FR" ? "Charger l’audio" : "Load audio"}
        </button>
      </div>
    );
  return (
    <audio controls preload="none" src={src}>
      {locale === "fr-FR"
        ? "Votre navigateur ne prend pas en charge l’audio."
        : "Your browser does not support audio."}
    </audio>
  );
}
