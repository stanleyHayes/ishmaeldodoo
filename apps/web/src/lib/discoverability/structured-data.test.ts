import { describe, expect, it } from "vitest";
import { structuredDataJson } from "./structured-data";

describe("structuredDataJson", () => {
  it("preserves JSON data while neutralizing inline script termination", () => {
    const serialized = structuredDataJson({
      title: "Evidence </script><script>alert(1)</script>",
    });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized)).toEqual({
      title: "Evidence </script><script>alert(1)</script>",
    });
  });
});
