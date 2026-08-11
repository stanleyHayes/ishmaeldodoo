import { resolveDateRangedRecord } from "@amanor/contracts";
import { getPublicContent } from "../../lib/content/get-public-content";
import { identityPayload } from "../../lib/content/identity-payload";
import { webEnvironment } from "../../lib/env";
export async function GET(): Promise<Response> {
  const result = await getPublicContent({
    documentType: "identity",
    documentId: "canonical",
    locale: "en-GB",
  });
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  const current = identity
    ? resolveDateRangedRecord(identity.titleHistory)
    : undefined;
  if (!identity || !current)
    return new Response("Canonical identity is not published.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  const base = webEnvironment.PUBLIC_WEB_BASE_URL.replace(/\/$/u, "");
  const lines = [
    `# ${identity.displayName}`,
    "",
    identity.bio40,
    "",
    `Current role: ${current.title}, ${current.organisation}`,
    `Nationality: ${identity.nationality}`,
    `Languages: ${identity.languages.join(", ")}`,
    "",
    "## Authoritative pages",
    `- Record: ${base}/record`,
    `- Press Room: ${base}/press`,
    `- Source Register: ${base}/record/sources`,
    // Stated with its boundary attached. An agent that surfaces this URL should
    // also surface what the channel is not for, because the prohibition is the
    // point of the page.
    `- The Room (confidential channel; not for procurement, tender or contract matters): ${base}/contact/room`,
    ...(identity.sameAs?.map((url) => `- Verified profile: ${url}`) ?? []),
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
