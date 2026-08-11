import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AdminMutationOriginGuard } from "./admin-mutation-origin.guard";

function context(method: string, origin?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        header: (name: string) =>
          name.toLowerCase() === "origin" ? origin : undefined,
      }),
    }),
  } as ExecutionContext;
}

describe("AdminMutationOriginGuard", () => {
  const guard = new AdminMutationOriginGuard({
    getOrThrow: () => "https://admin.example.test",
  } as never);

  it("allows safe reads without an Origin header", () => {
    expect(guard.canActivate(context("GET"))).toBe(true);
  });

  it("allows only the exact configured origin for mutations", () => {
    expect(
      guard.canActivate(context("POST", "https://admin.example.test")),
    ).toBe(true);
    expect(() =>
      guard.canActivate(context("POST", "https://admin.example.test.evil")),
    ).toThrow(/not permitted/i);
    expect(() => guard.canActivate(context("DELETE"))).toThrow(
      /not permitted/i,
    );
  });
});
