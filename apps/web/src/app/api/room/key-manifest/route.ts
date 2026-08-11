import { NextResponse } from "next/server";
import { publicServiceAuth, webEnvironment } from "../../../../lib/env";
import { serviceAuthHeaders } from "../../../../lib/service-auth";
import {
  correlationResponseHeaders,
  requestCorrelation,
} from "../../../../lib/request-correlation";

/**
 * Passes the signed recipient key manifest through to the browser, which
 * verifies the signature itself against the anchor pinned in the bundle.
 *
 * This route deliberately performs no verification of its own and adds no
 * fallback: if the API cannot produce a manifest, the page must fail closed and
 * offer the non-confidential contact route rather than accept plaintext.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const correlation = requestCorrelation(request);
  const url = new URL(
    `${webEnvironment.PUBLIC_API_BASE_URL}/public/room/key-manifest`,
  );
  try {
    const upstream = await fetch(url, {
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...serviceAuthHeaders(url, publicServiceAuth, "GET", correlation),
      },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { message: "The confidential channel is unavailable" },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            ...correlationResponseHeaders(correlation, upstream),
          },
        },
      );
    }
    const body: unknown = await upstream.json();
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "no-store",
        ...correlationResponseHeaders(correlation, upstream),
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The confidential channel is unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          ...correlationResponseHeaders(correlation),
        },
      },
    );
  }
}
