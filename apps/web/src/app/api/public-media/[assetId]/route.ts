import { NextResponse } from "next/server";
import { getPublicMedia } from "../../../../lib/content/get-public-media";
export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      assetId,
    )
  )
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  const locale =
    new URL(request.url).searchParams.get("locale") === "fr-FR"
      ? "fr-FR"
      : "en-GB";
  const result = await getPublicMedia(assetId, locale);
  if (result.status !== "available")
    return NextResponse.json(
      { message: result.status === "not_found" ? "Not found" : "Unavailable" },
      { status: result.status === "not_found" ? 404 : 503 },
    );
  return NextResponse.json(result.asset, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
