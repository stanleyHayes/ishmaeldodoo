import { describe, expect, it } from "vitest";
import { hasPermission } from "./roles";

describe("least-privilege roles", () => {
  it("keeps publishing, Desk and security authority separated", () => {
    expect(hasPermission(["editor"], "content:write")).toBe(true);
    expect(hasPermission(["editor"], "content:publish")).toBe(false);
    expect(hasPermission(["desk_officer"], "desk:operate")).toBe(true);
    expect(hasPermission(["desk_officer"], "security:manage")).toBe(false);
    expect(hasPermission(["reviewer"], "content:publish")).toBe(true);
    expect(hasPermission(["press_officer"], "press:manage")).toBe(true);
    expect(hasPermission(["press_officer"], "content:publish")).toBe(false);
    expect(hasPermission(["press_officer"], "desk:operate")).toBe(false);
    expect(hasPermission(["trust_admin"], "press:manage")).toBe(false);
  });
});
