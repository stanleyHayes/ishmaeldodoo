import { pressKitRequestSchema } from "@amanor/contracts";
import { NextResponse } from "next/server";
import { webEnvironment } from "@/lib/env";
import { requestPayload } from "@/lib/request-payload";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "@/lib/request-correlation";

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
  const parsed = pressKitRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400, headers: correlationResponseHeaders(correlation) },
    );
  try {
    const upstream = await fetch(
      `${webEnvironment.PUBLIC_API_BASE_URL}/public/press-kit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf, application/zip",
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
              ? "Press kit unavailable"
              : "Press kit generation failed",
        },
        {
          status: upstream.status,
          headers: correlationResponseHeaders(correlation, upstream),
        },
      );
    return new Response(upstream.body, {
      status: 201,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition":
          upstream.headers.get("content-disposition") ??
          "attachment; filename=amanor-press-kit",
        "Cache-Control": "no-store",
        ...correlationResponseHeaders(correlation, upstream),
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Press kit service unavailable" },
      { status: 503, headers: correlationResponseHeaders(correlation) },
    );
  }
}
