import { expect, test } from "@playwright/test";
import { generateTotpForTesting } from "../apps/api/src/modules/auth/domain/mfa";
import { e2eHardwareKeyEmail, e2eMfaSecret, e2ePassword } from "./auth-fixture";

test("enrols a virtual security key and issues hardware-backed elevation", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium CDP provides the deterministic virtual FIDO authenticator",
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "usb",
        hasResidentKey: false,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  try {
    await page.goto("https://localhost:3211");
    await page.getByLabel("Email address").fill(e2eHardwareKeyEmail);
    await page.getByLabel("Password").fill(e2ePassword);
    await page
      .getByLabel("Authenticator code")
      .fill(generateTotpForTesting(e2eMfaSecret, new Date()));
    await page.getByRole("button", { name: "Sign in" }).click();
    await page
      .getByRole("button", { name: /Security Sessions, roles/iu })
      .click();
    await expect(
      page.getByRole("heading", { name: "Confirm high-risk changes" }),
    ).toBeVisible();

    await page
      .getByLabel("Current authenticator code")
      .fill(
        generateTotpForTesting(e2eMfaSecret, new Date(Date.now() + 30_000)),
      );
    await page.getByRole("button", { name: "Verify recent MFA" }).click();
    await page
      .getByLabel("Security-key label")
      .fill("Chromium virtual USB key");
    await page
      .getByRole("button", { name: "Enrol local security key" })
      .click();
    await expect(page.getByText("Hardware key enrolled.")).toBeVisible();
    await expect(page.getByLabel("Enrolled hardware keys")).toContainText(
      "Chromium virtual USB key",
    );

    await page.getByRole("button", { name: "Verify hardware key" }).click();
    await expect(
      page.getByText(
        "Hardware key verified. Room access is elevated for five minutes.",
      ),
    ).toBeVisible();
  } finally {
    await cdp
      .send("WebAuthn.removeVirtualAuthenticator", { authenticatorId })
      .catch(() => undefined);
    await cdp.send("WebAuthn.disable").catch(() => undefined);
  }
});
