import type { PublicMedia } from "@amanor/contracts";
import Image from "next/image";
import Link from "next/link";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function RecordFieldImage({
  media,
  caption,
  locale,
  lite,
}: Readonly<{
  media?: PublicMedia | undefined;
  caption: string;
  locale: SupportedLocale;
  lite: boolean;
}>) {
  const french = locale === "fr-FR";
  return (
    <figure className="record-field-image">
      {lite ? (
        <div className="lite-media-placeholder">
          <p>{caption}</p>
          <Link href="?media=1">
            {french ? "Charger les images de terrain" : "Load field images"}
          </Link>
        </div>
      ) : media?.resourceType === "image" ? (
        <Image
          src={media.secureUrl}
          alt={media.altText}
          width={media.width ?? 1800}
          height={media.height ?? 1000}
          sizes="(max-width: 64rem) 100vw, 88vw"
          style={
            media.focalPoint
              ? {
                  objectPosition: `${media.focalPoint.x * 100}% ${media.focalPoint.y * 100}%`,
                }
              : undefined
          }
        />
      ) : (
        <div className="record-field-image__unavailable" role="status">
          <span aria-hidden="true">
            {french ? "Image à venir" : "Image pending"}
          </span>
          <strong>
            {french
              ? "Aucun portrait approuvé pour le moment"
              : "No approved portrait yet"}
          </strong>
          <p>
            {french
              ? "Le récit complet reste disponible pendant la validation de l’image."
              : "The complete story remains available while the image is being approved."}
          </p>
        </div>
      )}
      <figcaption>
        <span>{caption}</span>
        {media ? (
          <small>
            {media.credit} · {media.licence}
          </small>
        ) : null}
      </figcaption>
    </figure>
  );
}
