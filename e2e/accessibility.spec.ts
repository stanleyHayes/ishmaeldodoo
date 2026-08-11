import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/record/atlas/table?lite=1",
  "/record?lite=1",
  "/speaking/request?lite=1",
  "/press?lite=1",
  "/contact",
] as const;

test("has no serious or critical automated accessibility violations on key public journeys", async ({
  page,
}) => {
  for (const route of publicRoutes) {
    await page.goto(`https://localhost:3210${route}`);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );
    expect(
      blocking,
      `${route}: ${blocking.map(({ id, help }) => `${id}: ${help}`).join("; ")}`,
    ).toEqual([]);
  }
});

test("supports skip navigation and the complete Two Ledgers keyboard pattern", async ({
  page,
}, testInfo) => {
  await page.goto("https://localhost:3210/");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await page.keyboard.press(
    testInfo.project.name === "webkit" ? "Alt+Tab" : "Tab",
  );
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();

  const diplomatic = page.getByRole("tab", { name: "Diplomatic Record" });
  const operator = page.getByRole("tab", { name: "Operator’s Record" });
  await diplomatic.focus();
  await expect(diplomatic).toHaveAttribute("tabindex", "0");
  await expect(operator).toHaveAttribute("tabindex", "-1");

  await page.keyboard.press("ArrowRight");
  await expect(operator).toBeFocused();
  await expect(operator).toHaveAttribute("aria-selected", "true");
  await expect(operator).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "operator-ledger-tab",
  );

  await page.keyboard.press("Home");
  await expect(diplomatic).toBeFocused();
  await expect(diplomatic).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(operator).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(diplomatic).toBeFocused();
});

test("has no serious or critical automated accessibility violations on the Admin sign-in boundary", async ({
  page,
}) => {
  await page.goto("https://localhost:3211/");
  await expect(
    page.getByRole("heading", { name: "Administration" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  expect(
    blocking,
    blocking.map(({ id, help }) => `${id}: ${help}`).join("; "),
  ).toEqual([]);
});
