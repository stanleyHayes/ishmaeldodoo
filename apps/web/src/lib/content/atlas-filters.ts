import type { AtlasFilters } from "../../components/content/atlas-table";
export function atlasFilters(
  parameters: Record<string, string | string[] | undefined>,
): AtlasFilters {
  const value = (key: string) =>
    typeof parameters[key] === "string"
      ? parameters[key].slice(0, 120)
      : undefined;
  const era = value("era");
  const institution = value("institution");
  const theme = value("theme");
  const currency = value("currency");
  const rawScale = value("scale");
  const scale = ["under-1m", "1m-100m", "100m-plus", "unvalued"].includes(
    rawScale ?? "",
  )
    ? (rawScale as AtlasFilters["scale"])
    : undefined;
  return {
    ...(era ? { era } : {}),
    ...(institution ? { institution } : {}),
    ...(theme ? { theme } : {}),
    ...(currency ? { currency } : {}),
    ...(scale ? { scale } : {}),
  };
}
