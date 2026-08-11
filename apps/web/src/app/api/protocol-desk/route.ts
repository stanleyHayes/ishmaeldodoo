import {
  protocolDeskRequestSchema,
  protocolDeskResponseSchema,
} from "@amanor/contracts";
import { NextResponse } from "next/server";
import { webEnvironment } from "../../../lib/env";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "../../../lib/request-correlation";

export async function POST(request: Request): Promise<Response> {
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
  const parsed = protocolDeskRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400, headers: correlationResponseHeaders(correlation) },
    );
  try {
    const upstream = await fetch(
      `${webEnvironment.PUBLIC_API_BASE_URL}/public/protocol-desk/requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...correlationRequestHeaders(correlation),
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
    const responseBody = await upstream
      .json()
      .catch(() => ({ message: "Protocol Desk request failed" }));
    if (
      upstream.ok &&
      !protocolDeskResponseSchema.safeParse(responseBody).success
    )
      return NextResponse.json(
        { message: "Protocol Desk returned an invalid response" },
        {
          status: 502,
          headers: correlationResponseHeaders(correlation, upstream),
        },
      );
    return NextResponse.json(responseBody, {
      status: upstream.status,
      headers: {
        "Cache-Control": "private, no-store",
        ...correlationResponseHeaders(correlation, upstream),
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Protocol Desk unavailable" },
      { status: 503, headers: correlationResponseHeaders(correlation) },
    );
  }
}
