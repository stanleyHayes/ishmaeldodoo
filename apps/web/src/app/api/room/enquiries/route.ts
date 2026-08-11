import { roomSubmissionSchema } from "@amanor/contracts";
import { NextResponse } from "next/server";
import { webEnvironment } from "../../../../lib/env";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "../../../../lib/request-correlation";

/**
 * Forwards an already-encrypted submission. This handler never sees plaintext,
 * never writes the body anywhere, and returns a uniform failure shape so that a
 * rejected envelope cannot be told apart from an unavailable channel by anything
 * other than the status code the API itself chose.
 */
export const dynamic = "force-dynamic";

const unavailable = (correlation: ReturnType<typeof requestCorrelation>) =>
  NextResponse.json(
    { message: "The confidential channel is unavailable" },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        ...correlationResponseHeaders(correlation),
      },
    },
  );

export async function POST(request: Request): Promise<Response> {
  const correlation = requestCorrelation(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Submission was not accepted" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          ...correlationResponseHeaders(correlation),
        },
      },
    );
  }

  // Validated here as well as at the API so a malformed envelope never leaves
  // the submitter's own origin.
  const parsed = roomSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Submission was not accepted" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          ...correlationResponseHeaders(correlation),
        },
      },
    );
  }

  try {
    const upstream = await fetch(
      `${webEnvironment.PUBLIC_API_BASE_URL}/public/room/enquiries`,
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
    const responseBody: unknown = await upstream
      .json()
      .catch(() => ({ message: "Submission was not accepted" }));
    return NextResponse.json(responseBody, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        ...correlationResponseHeaders(correlation, upstream),
      },
    });
  } catch {
    // No success claim on uncertain delivery. The browser may retry with the
    // same envelope identifier without creating a second submission.
    return unavailable(correlation);
  }
}
