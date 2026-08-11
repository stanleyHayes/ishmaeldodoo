import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("P03 remains responsive across required viewports", async ({
  page,
}, testInfo) => {
  const rowCounts: number[] = [];
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/record/atlas?lite=1");
    await expect(
      page.getByRole("heading", { name: "The Atlas" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Every seeded act must be listed, checked by identity rather than by a
    // literal row count: this assertion previously hard-coded five and broke
    // the moment the fixture grew proof nodes, which said nothing about
    // responsiveness. The table carries period, role, place, outcomes and
    // sources, so the acts are identified by their role cell.
    for (const act of [1, 2, 3, 4]) {
      await expect(
        page.getByRole("cell", { name: `Role ${act} Institution ${act}` }),
      ).toBeVisible();
    }
    rowCounts.push(await page.getByRole("row").count());

    await page.screenshot({
      path: testInfo.outputPath(`atlas-${width}.png`),
      fullPage: false,
    });
  }

  // The point of the journey: narrow and wide render the same rows once each,
  // so a responsive layout never duplicates or drops the record.
  expect(rowCounts[0]).toBeGreaterThan(4);
  expect(rowCounts[0]).toBe(rowCounts[1]);
});

test("P03 prints the semantic record without interactive duplication", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium provides deterministic PDF output",
  );
  await page.goto("https://localhost:3210/record/atlas?lite=1");
  await expect(page.getByRole("table")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const pdfPath = testInfo.outputPath("atlas-record.pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  const information = execFileSync("pdfinfo", [pdfPath], {
    encoding: "utf8",
  });
  const pages = Number(/^Pages:\s+(\d+)$/mu.exec(information)?.[1]);
  expect(pages).toBeGreaterThan(0);
  expect(pages).toBeLessThanOrEqual(2);
  const text = execFileSync("pdftotext", [pdfPath, "-"], {
    encoding: "utf8",
  });
  expect(text).toContain("Published and verified career record");
  expect(text).toContain("Institution 1");
  expect(text).toContain("Verified outcome three");
  expect(text).not.toContain("Map and timeline");
  expect(text).not.toContain("Diplomatic Record");
  expect(text).not.toContain("Operator’s Record");
});
