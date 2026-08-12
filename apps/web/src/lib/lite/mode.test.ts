import { describe, expect, it } from "vitest";
import { isConstrainedConnection, isLiteValue } from "./mode";

describe("Lite mode state", () => {
  it("accepts only explicit lite values", () => {
    expect(isLiteValue("1")).toBe(true);
    expect(isLiteValue("lite")).toBe(true);
    expect(isLiteValue(["1", "0"])).toBe(true);
    expect(isLiteValue("true")).toBe(false);
  });

  it("detects Save-Data, 2g and slow-2g connections", () => {
    expect(isConstrainedConnection({ saveData: true })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "2g" })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "slow-2g" })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "4g" })).toBe(false);
  });
});
