import { describe, expect, it } from "vitest";
import { BrowserPdfService, escapeHtml } from "./browser-pdf.service";

describe("BrowserPdfService", () => {
  it("escapes all user-controlled HTML metacharacters", () => {
    expect(escapeHtml(`<script x="y">'&`)).toBe(
      "&lt;script x=&quot;y&quot;&gt;&#39;&amp;",
    );
  });

  it.runIf(process.platform === "darwin")(
    "renders a bounded PDF through headless Chrome",
    async () => {
      const pdf = await new BrowserPdfService().render(
        "<!doctype html><html><body><h1>Project AMANOR</h1></body></html>",
      );
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(1_000);
    },
    30_000,
  );
});
