import { describe, expect, it, vi } from "vitest";
import { exactCorsOrigin } from "./exact-cors-origin";

describe("exactCorsOrigin", () => {
  it("allows only the exact configured origin", () => {
    const decide = exactCorsOrigin("https://admin.example.test");
    const allowed = vi.fn();
    decide("https://admin.example.test", allowed);
    expect(allowed).toHaveBeenCalledWith(null, true);

    for (const origin of [
      undefined,
      "https://public.example.test",
      "https://admin.example.test.evil",
      "http://admin.example.test",
      "https://ADMIN.example.test",
    ]) {
      const denied = vi.fn();
      decide(origin, denied);
      expect(denied).toHaveBeenCalledWith(null, false);
    }
  });
});
