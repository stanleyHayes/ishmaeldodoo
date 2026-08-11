import { mediaEnquirySchema } from "@amanor/contracts";
import { NextResponse } from "next/server";
import { webEnvironment } from "@/lib/env";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "@/lib/request-correlation";
export async function POST(request: Request) {
  const correlation = requestCorrelation(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400, headers: correlationResponseHeaders(correlation) },
    );
  }
  const parsed = mediaEnquirySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400, headers: correlationResponseHeaders(correlation) },
    );
  try {
    const response = await fetch(
      `${webEnvironment.PUBLIC_API_BASE_URL}/public/media-enquiries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...correlationRequestHeaders(correlation),
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as unknown;
    return NextResponse.json(payload, {
      status: response.status,
      headers: correlationResponseHeaders(correlation, response),
    });
  } catch {
    return NextResponse.json(
      { message: "Media contact service unavailable" },
      { status: 503, headers: correlationResponseHeaders(correlation) },
    );
  }
}
