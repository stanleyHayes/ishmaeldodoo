import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

describe("HttpExceptionFilter", () => {
  it("maps parser body-limit errors to a non-reflective 413 envelope", () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, locals: { requestId: "request-1" } }),
        getRequest: () => ({ headers: {} }),
      }),
    } as ArgumentsHost;
    new HttpExceptionFilter().catch(
      {
        status: 413,
        type: "entity.too.large",
        body: "sensitive request content",
      },
      host,
    );
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 413,
        code: "PayloadTooLarge",
        message: "Request body is too large",
        requestId: "request-1",
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      "sensitive request content",
    );
  });
});
