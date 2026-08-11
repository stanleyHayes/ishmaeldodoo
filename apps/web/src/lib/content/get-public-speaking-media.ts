import type { PublicMedia, PublicSpeaking } from "@amanor/contracts";
import "server-only";
import { getPublicMedia } from "./get-public-media";

export async function getPublicSpeakingMedia(
  speaking: PublicSpeaking,
  locale: "en-GB" | "fr-FR",
): Promise<Readonly<Record<string, PublicMedia>>> {
  const assetIds = [
    ...new Set(
      speaking.items.flatMap((theme) =>
        (theme.media ?? []).map((item) => item.assetId),
      ),
    ),
  ];
  const entries = await Promise.all(
    assetIds.map(async (assetId) => {
      const result = await getPublicMedia(assetId, locale);
      return result.status === "available"
        ? ([assetId, result.asset] as const)
        : undefined;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}
