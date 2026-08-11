import { expect, test } from "@playwright/test";

const token = "a".repeat(43);

test("one-time Principal decision removes its fragment before confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `https://localhost:3210/protocol-decision#token=${token}&action=accept`,
  );

  await expect(
    page.getByRole("button", { name: "Confirm decision" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/protocol-decision$/u);
  expect(page.url()).not.toContain(token);
  await expect(
    page.getByRole("button", { name: "Confirm decision" }),
  ).toBeDisabled();
  await expect(page.locator("header, footer")).toHaveCount(0);
  await expect(page.getByText("Privacy-respecting measurement")).toHaveCount(0);
  expect(
    await page.evaluate(
      "document.documentElement.scrollWidth > document.documentElement.clientWidth",
    ),
  ).toBe(false);
});

test("French decline decision exposes its required category without leaking the token", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `https://localhost:3210/fr/protocol-decision#token=${token}&action=decline`,
  );

  await expect(page.getByLabel("Motif du refus")).toHaveValue("capacity");
  await expect(page).toHaveURL(/\/fr\/protocol-decision$/u);
  expect(page.url()).not.toContain(token);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/u,
  );
});
