import { livingDossierRequestSchema } from "@amanor/contracts";
import { NextResponse } from "next/server";
import { webEnvironment } from "../../../lib/env";
import { requestPayload } from "../../../lib/request-payload";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "../../../lib/request-correlation";

export async function POST(request: Request): Promise<Response> {
  const correlation = requestCorrelation(request);
  let body: unknown;
  try {
    body = await requestPayload(request);
  } catch {
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400, headers: correlationResponseHeaders(correlation) },
    );
  }
  const parsed = livingDossierRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400, headers: correlationResponseHeaders(correlation) },
    );
  try {
    const upstream = await fetch(
      `${webEnvironment.PUBLIC_API_BASE_URL}/public/living-dossier`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
          ...correlationRequestHeaders(correlation),
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      },
    );
    if (!upstream.ok)
      return NextResponse.json(
        {
          message:
            upstream.status === 404
              ? "Dossier unavailable"
              : "Dossier generation failed",
        },
        {
          status: upstream.status,
          headers: correlationResponseHeaders(correlation, upstream),
        },
      );
    return new Response(upstream.body, {
      status: 201,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          upstream.headers.get("content-disposition") ??
          "attachment; filename=amanor-dossier.pdf",
        "X-Dossier-Reference":
          upstream.headers.get("x-dossier-reference") ?? "",
        "Cache-Control": "private, no-store",
        ...correlationResponseHeaders(correlation, upstream),
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Dossier service unavailable" },
      { status: 503, headers: correlationResponseHeaders(correlation) },
    );
  }
}
