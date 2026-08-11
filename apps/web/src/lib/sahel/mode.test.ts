import { describe, expect, it } from "vitest";
import { isConstrainedConnection, isSahelValue } from "./mode";

describe("Sahel mode state", () => {
  it("accepts only explicit lite values", () => {
    expect(isSahelValue("1")).toBe(true);
    expect(isSahelValue("sahel")).toBe(true);
    expect(isSahelValue(["1", "0"])).toBe(true);
    expect(isSahelValue("true")).toBe(false);
  });

  it("detects Save-Data, 2g and slow-2g connections", () => {
    expect(isConstrainedConnection({ saveData: true })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "2g" })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "slow-2g" })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "4g" })).toBe(false);
  });
});
