import { describe, expect, it } from "vitest";
import { UnsafeInputPipe } from "./unsafe-input.pipe";

describe("UnsafeInputPipe", () => {
  const pipe = new UnsafeInputPipe();

  it("rejects Mongo operators, dotted paths and prototype keys recursively", () => {
    for (const value of [
      { $where: "sleep(1000)" },
      { nested: { "profile.role": "principal" } },
      JSON.parse('{"nested":{"__proto__":{"admin":true}}}') as unknown,
      { nested: { constructor: "override" } },
    ])
      expect(() => pipe.transform(value)).toThrow(/unsafe field/i);
  });

  it("accepts ordinary form content while bounding structural complexity", () => {
    expect(
      pipe.transform({ message: "<script>plain text</script>", tags: ["$5m"] }),
    ).toEqual({ message: "<script>plain text</script>", tags: ["$5m"] });
    let value: unknown = "leaf";
    for (let index = 0; index < 21; index += 1) value = { nested: value };
    expect(() => pipe.transform(value)).toThrow(/too complex/i);
  });
});
