import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("P02 remains responsive and the selected ledger prints as two A4 pages", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium provides PDF output",
  );
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/record?lite=1");
    await expect(page.getByRole("article")).toHaveCount(4);
    await expect(
      page.getByRole("navigation", { name: "Story progress" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`record-${width}.png`),
      fullPage: false,
    });
  }

  await page.getByRole("tab", { name: "Operator’s Record" }).click();
  await page.evaluate("document.body.classList.add('ledger-print')");
  await page.emulateMedia({ media: "print" });
  expect(
    await page.evaluate("getComputedStyle(document.body).backgroundColor"),
  ).toBe("rgb(255, 255, 255)");
  expect(
    await page.evaluate(
      "getComputedStyle(document.documentElement).backgroundColor",
    ),
  ).toBe("rgb(255, 255, 255)");
  const pdfPath = testInfo.outputPath("operator-ledger.pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  const information = execFileSync("pdfinfo", [pdfPath], {
    encoding: "utf8",
  });
  expect(information).toMatch(/^Pages:\s+2$/mu);
  const text = execFileSync("pdftotext", [pdfPath, "-"], {
    encoding: "utf8",
  });
  expect(text).toContain("The Two Ledgers");
  expect(text).toContain("Source appendix");
  expect(text).not.toContain("Skip to content");
  expect(text).not.toContain("No analytics in Lite mode");
});
