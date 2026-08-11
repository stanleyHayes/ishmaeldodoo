// @vitest-environment node

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  configureTelemetry,
  finishHttpServerSpan,
  startHttpServerSpan,
} from "./telemetry";

describe("OTLP/HTTP trace delivery", () => {
  const payloads: string[] = [];
  const collector = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      payloads.push(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  let shutdown: () => Promise<void> = () => Promise.resolve();

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      collector.listen(0, "127.0.0.1", resolve),
    );
    const address = collector.address();
    if (!address || typeof address === "string")
      throw new Error("Test collector did not bind a TCP port");
    shutdown = configureTelemetry({
      endpoint: `http://127.0.0.1:${address.port}/v1/traces`,
      sampleRatio: 1,
      serviceVersion: "test-version",
    });
  });

  afterAll(async () => {
    await shutdown();
    await new Promise<void>((resolve, reject) =>
      collector.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("delivers OTLP JSON through the configured collector endpoint", async () => {
    const span = startHttpServerSpan("get", "/v1/health/ready", undefined);
    finishHttpServerSpan(span, 200);
    await shutdown();

    expect(payloads).toHaveLength(1);
    const payload = JSON.parse(payloads[0]!) as Record<string, unknown>;
    expect(JSON.stringify(payload)).toContain("amanor-api");
    expect(JSON.stringify(payload)).toContain("GET /v1/health/ready");
    expect(JSON.stringify(payload)).not.toMatch(
      /authorization|cookie|email|phone|payload|requestId|token/iu,
    );
    shutdown = () => Promise.resolve();
  });
});
