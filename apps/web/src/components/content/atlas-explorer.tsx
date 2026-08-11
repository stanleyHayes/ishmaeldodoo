"use client";
import {
  publicMediaSchema,
  type PublicAtlasNode,
  type PublicMedia,
} from "@amanor/contracts";
import type { Map as LeafletMap } from "leaflet";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function AtlasExplorer({
  items,
  locale,
  tileUrl,
  attribution,
  lite = false,
  initialNode,
}: Readonly<{
  items: readonly PublicAtlasNode[];
  locale: SupportedLocale;
  tileUrl: string;
  attribution: string;
  lite?: boolean;
  initialNode?: string;
}>) {
  const fr = locale === "fr-FR";
  const mapped = useMemo(
    () => items.filter((item) => item.coordinates),
    [items],
  );
  const tourNodes = useMemo(
    () =>
      [...new Map(items.map((item) => [item.era, item])).values()].slice(0, 4),
    [items],
  );
  const [selected, setSelected] = useState(
    items.some((item) => item.slug === initialNode)
      ? initialNode
      : (mapped[0]?.slug ?? items[0]?.slug),
  );
  const [loadMap, setLoadMap] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [tourAvailable, setTourAvailable] = useState(true);
  const [touring, setTouring] = useState(false);
  const [media, setMedia] = useState<PublicMedia>({
    assetId: "00000000-0000-4000-8000-000000000000",
    secureUrl: "https://invalid.example/",
    resourceType: "raw",
    format: "none",
    bytes: 0,
    version: 0,
    altText: "Unavailable",
    credit: "Unavailable",
    licence: "Unavailable",
    sourceRef: "unavailable",
  });
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | undefined>(undefined);
  const markers = useRef(new Map<string, { setStyle(style: object): void }>());
  const tourTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const route = `${fr ? "/fr" : ""}/record/atlas`;

  function openRecord(slug: string): void {
    stopTour();
    setSelected(slug);
    const url = new URL(window.location.href);
    url.searchParams.set("node", slug);
    window.history.replaceState(window.history.state, "", url);
    void trackAnalyticsEvent({
      name: "atlas_record_opened",
      route,
      locale,
      ...(lite ? { mode: "sahel" as const } : {}),
    });
  }

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const constrained =
      lite ||
      connection?.saveData ||
      ["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
    if (!constrained) queueMicrotask(() => setLoadMap(true));
  }, [lite]);

  useEffect(() => {
    const unavailable =
      lite ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.localStorage.getItem("amanor-atlas-tour-seen") === "true";
    if (unavailable) queueMicrotask(() => setTourAvailable(false));
    return () => {
      if (tourTimer.current) clearInterval(tourTimer.current);
    };
  }, [lite]);

  function stopTour(): void {
    if (tourTimer.current) clearInterval(tourTimer.current);
    tourTimer.current = undefined;
    setTouring(false);
  }
  function startTour(): void {
    if (tourNodes.length === 0) return;
    window.localStorage.setItem("amanor-atlas-tour-seen", "true");
    setTourAvailable(false);
    setTouring(true);
    setSelected(tourNodes[0]!.slug);
    let index = 0;
    tourTimer.current = setInterval(() => {
      index += 1;
      if (index >= tourNodes.length) {
        stopTour();
        return;
      }
      setSelected(tourNodes[index]!.slug);
    }, 5_000);
  }

  useEffect(() => {
    if (!loadMap || !container.current || mapRef.current || mapped.length === 0)
      return;
    let active = true;
    const markerStore = markers.current;
    void import("leaflet").then((L) => {
      if (!active || !container.current) return;
      const map = L.map(container.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer(tileUrl, { attribution, maxZoom: 18 })
        .on("tileerror", () => setMapUnavailable(true))
        .addTo(map);
      const bounds: [number, number][] = [];
      for (const item of mapped) {
        const [longitude, latitude] = item.coordinates!;
        bounds.push([latitude, longitude]);
        const marker = L.circleMarker([latitude, longitude], {
          radius: 6,
          color: "#b54b30",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindTooltip(item.label);
        marker.on("click", () => {
          if (tourTimer.current) clearInterval(tourTimer.current);
          tourTimer.current = undefined;
          setTouring(false);
          setSelected(item.slug);
          void trackAnalyticsEvent({
            name: "atlas_record_opened",
            route,
            locale,
            ...(lite ? { mode: "sahel" as const } : {}),
          });
        });
        markerStore.set(item.slug, marker);
      }
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 6 });
    });
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = undefined;
      markerStore.clear();
    };
  }, [attribution, lite, loadMap, locale, mapped, route, tileUrl]);

  useEffect(() => {
    for (const [slug, marker] of markers.current)
      marker.setStyle({
        radius: slug === selected ? 9 : 6,
        weight: slug === selected ? 3 : 1,
      });
    const item = mapped.find((node) => node.slug === selected);
    if (item?.coordinates && mapRef.current) {
      const [longitude, latitude] = item.coordinates;
      mapRef.current.setView(
        [latitude, longitude],
        Math.max(mapRef.current.getZoom(), 5),
        {
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
        },
      );
    }
  }, [mapped, selected]);

  const detail = items.find((item) => item.slug === selected);
  useEffect(() => {
    if (!detail?.image) return;
    const controller = new AbortController();
    void fetch(
      `/api/public-media/${encodeURIComponent(detail.image)}?locale=${locale}`,
      { signal: controller.signal },
    )
      .then(async (response) =>
        response.ok ? publicMediaSchema.safeParse(await response.json()) : null,
      )
      .then((parsed) => {
        if (parsed?.success) setMedia(parsed.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [detail?.image, locale]);

  return (
    <section className="atlas-explorer" aria-labelledby="atlas-map-heading">
      <div className="atlas-explorer__header">
        <div>
          <p className="section-number">01</p>
          <h2 id="atlas-map-heading">
            {fr ? "Carte et chronologie" : "Map and timeline"}
          </h2>
        </div>
        <div className="atlas-tour-actions">
          {tourAvailable ? (
            <button onClick={startTour}>
              {fr
                ? "Voir le parcours en 20 secondes"
                : "Take the 20-second tour"}
            </button>
          ) : null}
          {touring ? (
            <button onClick={stopTour}>
              {fr ? "Passer la visite" : "Skip tour"}
            </button>
          ) : null}
          {!loadMap ? (
            <button onClick={() => setLoadMap(true)}>
              {fr ? "Charger la carte" : "Load interactive map"}
            </button>
          ) : null}
        </div>
      </div>
      {loadMap ? (
        <>
          <div
            ref={container}
            className="atlas-map"
            aria-label={
              fr ? "Carte interactive du parcours" : "Interactive career map"
            }
          />
          {mapUnavailable ? (
            <p className="register-state" role="status">
              {fr
                ? "Les tuiles cartographiques sont temporairement indisponibles. La chronologie et le tableau complet restent disponibles."
                : "Map tiles are temporarily unavailable. The timeline and complete table remain available."}
            </p>
          ) : null}
        </>
      ) : (
        <p className="register-state">
          {fr
            ? "La carte est désactivée en mode économie de données. Le tableau complet reste disponible."
            : "The map is off in data-saving mode. The complete table remains available."}
        </p>
      )}
      <div
        className="atlas-timeline"
        role="group"
        aria-label={fr ? "Chronologie" : "Timeline"}
      >
        {items.map((item) => (
          <button
            key={item.slug}
            aria-pressed={item.slug === selected}
            onClick={() => openRecord(item.slug)}
          >
            <time>{item.startDate.getUTCFullYear()}</time>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      {detail ? (
        <aside id={detail.slug} className="atlas-detail" aria-live="polite">
          {media?.assetId === detail.image && media.resourceType === "image" ? (
            <Image
              src={media.secureUrl}
              alt={media.altText}
              width={media.width ?? 1200}
              height={media.height ?? 800}
              sizes="(max-width: 48rem) 100vw, 48rem"
              style={
                media.focalPoint
                  ? {
                      objectFit: "cover",
                      objectPosition: `${media.focalPoint.x * 100}% ${media.focalPoint.y * 100}%`,
                    }
                  : undefined
              }
            />
          ) : null}
          <p>{detail.era}</p>
          <h3>{detail.role}</h3>
          <p>
            {detail.institution} ·{" "}
            {detail.city ?? detail.region ?? detail.country}
          </p>
          <p>
            <time>{detail.startDate.getUTCFullYear()}</time>–
            <time>
              {detail.endDate?.getUTCFullYear() ?? (fr ? "présent" : "present")}
            </time>
          </p>
          <ul>
            {detail.outcomes.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
          {detail.portfolioValue !== undefined ? (
            <p>
              {detail.valueType ? `${detail.valueType}: ` : ""}
              {detail.currency
                ? new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: detail.currency,
                  }).format(detail.portfolioValue)
                : detail.portfolioValue.toLocaleString(locale)}
              {detail.valueYear ? ` (${detail.valueYear})` : ""}
            </p>
          ) : null}
          <div className="atlas-detail__links">
            {detail.sourceRefs.map((ref) => (
              <Link key={ref} href={`${fr ? "/fr" : ""}/record/sources#${ref}`}>
                {ref}
              </Link>
            ))}
            {detail.relatedArchive?.map((slug) => (
              <Link
                key={slug}
                href={`${fr ? "/fr" : ""}/archive?item=${encodeURIComponent(slug)}`}
              >
                {fr ? `Archive\u00a0: ${slug}` : `Archive: ${slug}`}
              </Link>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
