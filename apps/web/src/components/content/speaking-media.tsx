"use client";

import type { PublicMedia, PublicSpeakingTheme } from "@amanor/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { parsePublicMedia } from "../../lib/content/parse-public-media";
import { LiteImage } from "./lite-media";
import styles from "./speaking-evidence.module.css";

type SpeakingMediaItem = NonNullable<PublicSpeakingTheme["media"]>[number];

export function SpeakingMedia({
  item,
  locale,
  lite,
}: Readonly<{
  item: SpeakingMediaItem;
  locale: SupportedLocale;
  lite: boolean;
}>) {
  const french = locale === "fr-FR";
  const [media, setMedia] = useState<PublicMedia>();
  const [loadVideo, setLoadVideo] = useState(!lite);

  useEffect(() => {
    let active = true;
    void fetch(
      `/api/public-media/${encodeURIComponent(item.assetId)}?locale=${locale}`,
    )
      .then(async (response) =>
        response.ok ? parsePublicMedia(await response.json()) : undefined,
      )
      .then((parsed) => {
        if (active && parsed) setMedia(parsed);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [item.assetId, locale]);

  if (!media || media.resourceType !== item.kind) return null;

  return (
    <figure
      className={styles.mediaItem}
      style={
        media.focalPoint
          ? ({
              "--media-focal": `${media.focalPoint.x * 100}% ${media.focalPoint.y * 100}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {item.kind === "image" ? (
        <LiteImage
          src={media.secureUrl}
          alt={media.altText}
          width={media.width ?? 1200}
          height={media.height ?? 800}
          locale={locale}
          lite={lite}
        />
      ) : loadVideo ? (
        <video controls preload="none" poster="" src={media.secureUrl}>
          {french
            ? "Votre navigateur ne prend pas en charge la vidéo."
            : "Your browser does not support video."}
        </video>
      ) : (
        <div className="lite-media-placeholder">
          <p>{item.caption}</p>
          <button type="button" onClick={() => setLoadVideo(true)}>
            {french ? "Charger la vidéo" : "Load video"}
          </button>
        </div>
      )}
      <figcaption>
        <span>{item.caption}</span>
        <span>
          {media.credit} · {media.licence}
        </span>
        {item.relatedArchive ? (
          <Link
            href={`${localizePath("/archive", locale)}#${item.relatedArchive}`}
          >
            {french ? "Transcription et contexte" : "Transcript and context"}
          </Link>
        ) : null}
      </figcaption>
    </figure>
  );
}
