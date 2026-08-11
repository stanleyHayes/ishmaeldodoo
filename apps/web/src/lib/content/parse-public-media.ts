import type { PublicMedia } from "@amanor/contracts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isOptionalPositiveInteger(
  value: unknown,
): value is number | undefined {
  return value === undefined || (isNonNegativeInteger(value) && value > 0);
}

function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.username === "" && url.password === ""
    );
  } catch {
    return false;
  }
}

export function parsePublicMedia(value: unknown): PublicMedia | undefined {
  if (!isRecord(value)) return undefined;
  const focalPoint = value.focalPoint;
  if (
    focalPoint !== undefined &&
    (!isRecord(focalPoint) ||
      typeof focalPoint.x !== "number" ||
      !Number.isFinite(focalPoint.x) ||
      focalPoint.x < 0 ||
      focalPoint.x > 1 ||
      typeof focalPoint.y !== "number" ||
      !Number.isFinite(focalPoint.y) ||
      focalPoint.y < 0 ||
      focalPoint.y > 1)
  ) {
    return undefined;
  }
  if (
    !isNonEmptyString(value.assetId) ||
    !uuidPattern.test(value.assetId) ||
    !isSafeUrl(value.secureUrl) ||
    !["image", "video", "audio", "raw"].includes(
      typeof value.resourceType === "string" ? value.resourceType : "",
    ) ||
    !isNonEmptyString(value.format) ||
    !isOptionalPositiveInteger(value.width) ||
    !isOptionalPositiveInteger(value.height) ||
    (value.duration !== undefined &&
      (typeof value.duration !== "number" ||
        !Number.isFinite(value.duration) ||
        value.duration < 0)) ||
    !isNonNegativeInteger(value.bytes) ||
    !isNonNegativeInteger(value.version) ||
    !isNonEmptyString(value.altText) ||
    !isNonEmptyString(value.credit) ||
    !isNonEmptyString(value.licence) ||
    !isNonEmptyString(value.sourceRef)
  ) {
    return undefined;
  }
  return {
    assetId: value.assetId,
    secureUrl: value.secureUrl,
    resourceType: value.resourceType as PublicMedia["resourceType"],
    format: value.format,
    ...(value.width === undefined ? {} : { width: value.width }),
    ...(value.height === undefined ? {} : { height: value.height }),
    ...(value.duration === undefined ? {} : { duration: value.duration }),
    bytes: value.bytes,
    version: value.version,
    altText: value.altText,
    credit: value.credit,
    licence: value.licence,
    sourceRef: value.sourceRef,
    ...(focalPoint === undefined
      ? {}
      : {
          focalPoint: { x: focalPoint.x as number, y: focalPoint.y as number },
        }),
  };
}
