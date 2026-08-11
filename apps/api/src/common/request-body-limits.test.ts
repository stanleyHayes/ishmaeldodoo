import { describe, expect, it, vi } from "vitest";
import { configureRequestBodyLimits } from "./request-body-limits";

describe("request body limits", () => {
  it("installs explicit narrow JSON and form bounds", () => {
    const useBodyParser = vi.fn();
    configureRequestBodyLimits({ useBodyParser } as never);
    expect(useBodyParser).toHaveBeenNthCalledWith(1, "json", {
      limit: "32kb",
    });
    expect(useBodyParser).toHaveBeenNthCalledWith(2, "urlencoded", {
      limit: "16kb",
      extended: false,
    });
  });
});
