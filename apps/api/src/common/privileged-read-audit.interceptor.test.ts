import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../modules/auth/persistence/auth.repository";
import { PrivilegedReadAuditInterceptor } from "./privileged-read-audit.interceptor";

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => class CmsController {},
    getHandler: () => ({ list() {} }).list,
  } as unknown as ExecutionContext;
}

describe("PrivilegedReadAuditInterceptor", () => {
  it("records a successful authenticated read using only a stable operation identifier", async () => {
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const interceptor = new PrivilegedReadAuditInterceptor({
      appendEvent,
    } as unknown as AuthRepository);
    const response = { items: [{ private: true }] };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({
            method: "GET",
            auth: {
              subject: "editor-1",
              sessionId: "must-not-be-copied",
              roles: ["editor"],
            },
            originalUrl: "/v1/cms/content/page?q=secret",
            query: { q: "secret" },
          }),
          { handle: () => of(response) } as CallHandler,
        ),
      ),
    ).resolves.toBe(response);
    expect(appendEvent).toHaveBeenCalledWith({
      eventId: expect.any(String),
      type: "privileged_data_read",
      actorId: "editor-1",
      occurredAt: expect.any(Date),
      outcome: "success",
      reason: "CmsController.list",
    });
    expect(JSON.stringify(appendEvent.mock.calls)).not.toMatch(
      /must-not-be-copied|secret|originalUrl|query/iu,
    );
  });

  it("does not audit public, mutating, or failed requests as successful reads", async () => {
    const appendEvent = vi.fn();
    const interceptor = new PrivilegedReadAuditInterceptor({
      appendEvent,
    } as unknown as AuthRepository);

    await lastValueFrom(
      interceptor.intercept(context({ method: "GET" }), {
        handle: () => of("public"),
      } as CallHandler),
    );
    await lastValueFrom(
      interceptor.intercept(
        context({ method: "POST", auth: { subject: "editor-1" } }),
        { handle: () => of("mutation") } as CallHandler,
      ),
    );
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({ method: "GET", auth: { subject: "editor-1" } }),
          {
            handle: () => throwError(() => new Error("read failed")),
          } as CallHandler,
        ),
      ),
    ).rejects.toThrow("read failed");
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it("fails closed when the successful read cannot be audited", async () => {
    const interceptor = new PrivilegedReadAuditInterceptor({
      appendEvent: vi.fn().mockRejectedValue(new Error("audit unavailable")),
    } as unknown as AuthRepository);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context({ method: "GET", auth: { subject: "editor-1" } }),
          { handle: () => of("private") } as CallHandler,
        ),
      ),
    ).rejects.toThrow("audit unavailable");
  });
});
