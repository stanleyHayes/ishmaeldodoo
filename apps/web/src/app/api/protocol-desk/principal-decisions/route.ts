import {
  principalDecisionInputSchema,
  principalDecisionResponseSchema,
} from "@amanor/contracts";
import { NextResponse } from "next/server";
import { webEnvironment } from "../../../../lib/env";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "../../../../lib/request-correlation";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export async function POST(request: Request): Promise<Response> {
  const correlation = requestCorrelation(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ message: "Invalid decision" }, 400, correlation);
  }
  const parsed = principalDecisionInputSchema.safeParse(body);
  if (!parsed.success)
    return response({ message: "Invalid decision" }, 400, correlation);
  try {
    const upstream = await fetch(
      `${webEnvironment.PUBLIC_API_BASE_URL}/public/protocol-desk/requests/principal-decisions`,
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
    const payload = await upstream
      .json()
      .catch(() => ({ message: "Decision could not be recorded" }));
    if (
      upstream.ok &&
      !principalDecisionResponseSchema.safeParse(payload).success
    )
      return response(
        { message: "Protocol Desk returned an invalid response" },
        502,
        correlation,
        upstream,
      );
    return response(payload, upstream.status, correlation, upstream);
  } catch {
    return response({ message: "Protocol Desk unavailable" }, 503, correlation);
  }
}

function response(
  body: unknown,
  status: number,
  correlation: ReturnType<typeof requestCorrelation>,
  upstream?: Response,
): Response {
  return NextResponse.json(body, {
    status,
    headers: {
      ...privateHeaders,
      ...correlationResponseHeaders(correlation, upstream),
    },
  });
}
