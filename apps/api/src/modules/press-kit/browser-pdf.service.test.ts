import { describe, expect, it } from "vitest";
import {
  assertOfflineGeneratedHtml,
  BrowserPdfService,
  escapeHtml,
} from "./browser-pdf.service";

describe("BrowserPdfService", () => {
  it("escapes all user-controlled HTML metacharacters", () => {
    expect(escapeHtml(`<script x="y">'&`)).toBe(
      "&lt;script x=&quot;y&quot;&gt;&#39;&amp;",
    );
  });

  it.each([
    '<!doctype html><img src="https://example.com/a.png">',
    '<!doctype html><img src="//example.com/a.png">',
    '<!doctype html><a href="file:///etc/passwd">x</a>',
    '<!doctype html><a href="javascript:alert(1)">x</a>',
  ])("rejects non-offline generated HTML", (html) => {
    expect(() => assertOfflineGeneratedHtml(html)).toThrow(
      "may not reference external resources",
    );
  });

  it("accepts inline CSS and bounded data images", () => {
    expect(() =>
      assertOfflineGeneratedHtml(
        '<!doctype html><style>body{color:#111}</style><img src="data:image/png;base64,AA==">',
      ),
    ).not.toThrow();
  });

  it("rejects missing document boundaries and oversized HTML", () => {
    expect(() => assertOfflineGeneratedHtml("<p>fragment</p>")).toThrow(
      "missing or exceeds",
    );
    expect(() =>
      assertOfflineGeneratedHtml(`<!doctype html>${"x".repeat(2_097_153)}`),
    ).toThrow("missing or exceeds");
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
