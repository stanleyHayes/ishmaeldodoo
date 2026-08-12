import { expect, test, type CDPSession } from "@playwright/test";

const profiles = {
  "android-emulated-3g": {
    effectiveType: "3g",
    latency: 150,
    downloadThroughput: (1_600 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: "cellular3g" as const,
  },
  "android-emulated-2g": {
    effectiveType: "2g",
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (160 * 1024) / 8,
    connectionType: "cellular2g" as const,
  },
} as const;

test.setTimeout(120_000);

let networkSession: CDPSession | undefined;

test.beforeEach(async ({ page, context }, testInfo) => {
  const profile = profiles[testInfo.project.name as keyof typeof profiles];
  if (!profile) throw new Error("Device test requires a declared profile");
  await page.addInitScript((effectiveType) => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType, saveData: effectiveType === "2g" },
    });
  }, profile.effectiveType);
  networkSession = await context.newCDPSession(page);
  await networkSession.send("Network.enable");
  await networkSession.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: profile.latency,
    downloadThroughput: profile.downloadThroughput,
    uploadThroughput: profile.uploadThroughput,
    connectionType: profile.connectionType,
  });
  await testInfo.attach("emulated-device-network.json", {
    body: Buffer.from(
      JSON.stringify({
        evidenceClass: "chromium-emulation-not-physical-device",
        viewport: testInfo.project.use.viewport,
        hasTouch: testInfo.project.use.hasTouch,
        isMobile: testInfo.project.use.isMobile,
        profile,
      }),
    ),
    contentType: "application/json",
  });
});

test.afterEach(async () => {
  await networkSession?.detach();
  networkSession = undefined;
});

test("keeps the bilingual public shell usable under constrained Android emulation", async ({
  page,
}, testInfo) => {
  await page.goto("https://localhost:3210/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A record built to remain accurate",
  );
  await expect(
    page.getByRole("link", { name: "FR", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
  ).toBe(true);
  const frenchLink = page.getByRole("link", { name: "FR", exact: true });
  const target = await frenchLink.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);
  await frenchLink.click();
  await expect(page).toHaveURL("https://localhost:3210/fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Une source conçue pour rester exacte",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-FR");
});

test("preserves Lite and Protocol Desk behavior under the declared network", async ({
  page,
}, testInfo) => {
  await page.goto("https://localhost:3210/", { waitUntil: "domcontentloaded" });
  if (testInfo.project.name.endsWith("2g")) {
    await expect(page.locator("html")).toHaveAttribute("data-mode", "lite", {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("button", { name: "Exit Lite mode" }),
    ).toBeVisible();
    await page.goto("https://localhost:3210/record/atlas", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/record\/atlas\/table/u);
    await expect(
      page.getByRole("heading", { name: "Accessible table" }),
    ).toBeVisible();
  } else {
    await expect(page.locator("html")).not.toHaveAttribute("data-mode", "lite");
  }

  await page.goto("https://localhost:3210/speaking/request", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Request an engagement" }),
  ).toBeVisible();
  await expect(page.locator(".protocol-desk")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: 45_000 },
  );
  const personalCapacity = page.getByLabel(/personal capacity/);
  await personalCapacity.check();
  await expect
    .poll(
      async () =>
        page.evaluate(
          "window.localStorage.getItem('amanor:protocol-desk:en-GB:v1')",
        ),
      { timeout: 45_000 },
    )
    .toContain('"capacity":"personal"');
  await page.getByRole("button", { name: "Continue" }).click();
  const organisationName = page
    .getByLabel("Organisation name")
    .filter({ visible: true });
  await expect(organisationName).toBeVisible({ timeout: 30_000 });
  await organisationName.fill("Synthetic Android rehearsal");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Saved progress restored.")).toBeVisible();
  await expect(
    page.getByLabel("Organisation name").filter({ visible: true }),
  ).toHaveValue("Synthetic Android rehearsal");
});
