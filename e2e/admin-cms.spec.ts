import { expect, test, type Page } from "@playwright/test";
import mongoose from "mongoose";
import { generateTotpForTesting } from "../apps/api/src/modules/auth/domain/mfa";
import {
  e2eEmail,
  e2eMfaSecret,
  e2ePassword,
  e2eProtocolReference,
  e2eRoleEmail,
  e2eMongoUri,
} from "./auth-fixture";

const loginUrl = "https://localhost:4210/v1/auth/login";

async function completeLogin(page: Page) {
  await page.getByLabel("Email address").fill("editor@example.test");
  await page.getByLabel("Password").fill("a-valid-fourteen-character-password");
  await page.getByLabel("Authenticator code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function completeLiveLogin(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(e2ePassword);
  await page
    .getByLabel("Authenticator code")
    .fill(generateTotpForTesting(e2eMfaSecret, new Date()));
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function expectTransitionOptions(
  page: Page,
  expected: readonly string[],
): Promise<void> {
  expect(
    await page
      .getByLabel("Next state")
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => String(Reflect.get(option, "value"))),
      ),
  ).toEqual(expected);
}

async function failCalendarSync(reference: string): Promise<void> {
  const connection = await mongoose.createConnection(e2eMongoUri).asPromise();
  try {
    const database = connection.db;
    if (!database) throw new Error("E2E MongoDB database is unavailable");
    const request = await database
      .collection("protocol_requests")
      .findOne({ reference }, { projection: { requestId: 1 } });
    if (!request) throw new Error(`Protocol request ${reference} is missing`);
    const result = await database.collection("calendar_sync_jobs").updateOne(
      { requestId: request.requestId, status: "pending" },
      {
        $set: {
          status: "failed",
          attempts: 2,
          availableAt: new Date(),
          lastError: "Calendar adapter returned HTTP 503",
        },
      },
    );
    if (result.modifiedCount !== 1)
      throw new Error(`Calendar job for ${reference} was not failed`);
  } finally {
    await connection.close();
  }
}

async function failAcceptanceCorrespondence(reference: string): Promise<void> {
  const connection = await mongoose.createConnection(e2eMongoUri).asPromise();
  try {
    const database = connection.db;
    if (!database) throw new Error("E2E MongoDB database is unavailable");
    const request = await database
      .collection("protocol_requests")
      .findOne({ reference }, { projection: { requestId: 1 } });
    if (!request) throw new Error(`Protocol request ${reference} is missing`);
    const result = await database.collection("correspondence").updateOne(
      {
        requestId: request.requestId,
        template: "acceptance",
        status: "pending",
      },
      {
        $set: {
          status: "failed",
          attempts: 2,
          availableAt: new Date(),
          lastError: "Correspondence provider returned HTTP 503",
        },
      },
    );
    if (result.modifiedCount !== 1)
      throw new Error(
        `Acceptance correspondence for ${reference} was not failed`,
      );
  } finally {
    await connection.close();
  }
}

async function failPrincipalDecisionDelivery(reference: string): Promise<void> {
  const connection = await mongoose.createConnection(e2eMongoUri).asPromise();
  try {
    const database = connection.db;
    if (!database) throw new Error("E2E MongoDB database is unavailable");
    const request = await database
      .collection("protocol_requests")
      .findOne({ reference }, { projection: { requestId: 1 } });
    if (!request) throw new Error(`Protocol request ${reference} is missing`);
    const result = await database
      .collection("protocol_principal_decision_deliveries")
      .updateOne(
        { requestId: request.requestId, status: "pending" },
        {
          $set: {
            status: "failed",
            attempts: 2,
            availableAt: new Date(),
            lastError: "Resend returned HTTP 503",
          },
        },
      );
    if (result.modifiedCount !== 1)
      throw new Error(`Principal delivery for ${reference} was not failed`);
  } finally {
    await connection.close();
  }
}

test("keeps protected navigation hidden and returns a uniform authentication failure", async ({
  page,
}) => {
  await page.route(loginUrl, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Internal mismatch",
        requestId: "request-1",
      }),
    });
  });
  await page.goto("https://localhost:3211/");

  await expect(
    page.getByRole("heading", { name: "Administration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Administration sections" }),
  ).toHaveCount(0);
  await completeLogin(page);
  await expect(page.locator("p.form-error[role='alert']")).toHaveText(
    "Sign-in failed. Check your credentials and verification code, then try again.",
  );
  await expect(page.getByText("Internal mismatch")).toHaveCount(0);
});

test("applies API roles to the protected shell and browses CMS records", async ({
  page,
}) => {
  await page.route(loginUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "browser-access-token",
        csrfToken: "browser-csrf-token-that-is-at-least-thirty-two-bytes",
        expiresIn: 300,
        user: { id: "editor-browser-1", roles: ["editor"] },
      }),
    });
  });
  await page.route("**/v1/cms/content/page?limit=25", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            documentType: "page",
            documentId: "home",
            latestVersion: 3,
            state: "in_review",
            updatedAt: "2026-08-09T12:00:00.000Z",
          },
        ],
      }),
    });
  });
  await page.route("**/v1/auth/logout", async (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto("https://localhost:3211/");
  await completeLogin(page);

  const navigation = page.getByRole("navigation", {
    name: "Administration sections",
  });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: /Content/ }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: /Protocol Desk/ }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("button", { name: /Security/ }),
  ).toHaveCount(0);

  await navigation.getByRole("button", { name: /Content/ }).click();
  await expect(
    page.getByRole("heading", { name: "Open a CMS record" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse records" }).click();
  await expect(
    page.getByRole("button", { name: /Select home, version 3, in review/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(navigation).toHaveCount(0);
});

test("authenticates with the live NestJS password and TOTP session boundary", async ({
  page,
  context,
  browserName,
}) => {
  await page.goto("https://localhost:3211/");
  await page.getByLabel("Email address").fill(e2eEmail(browserName));
  await page.getByLabel("Password").fill(e2ePassword);
  await page
    .getByLabel("Authenticator code")
    .fill(generateTotpForTesting(e2eMfaSecret, new Date()));
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Security administrator")).toBeVisible();
  const cookies = await context.cookies("https://localhost:4210/v1/auth");
  expect(
    cookies.find((cookie) => cookie.name === "__Secure-amanor_refresh")
      ?.httpOnly,
  ).toBe(true);
  expect(
    cookies.find((cookie) => cookie.name === "__Secure-amanor_refresh")?.secure,
  ).toBe(true);
  expect(
    cookies.find((cookie) => cookie.name === "__Secure-amanor_csrf")?.httpOnly,
  ).toBe(false);

  await page.getByRole("button", { name: /Security/ }).click();
  await expect(
    page.getByRole("heading", { name: "Active sessions" }),
  ).toBeVisible();
  await expect(
    page.getByText("Current session", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PWD + TOTP", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Security and data-access audit" }),
  ).toBeVisible();
  await expect(page.getByText("Login succeeded").first()).toBeVisible();
  await expect(page.getByText(/chain integrity: valid/iu)).toBeVisible();
  await page.getByRole("button", { name: /Overview/ }).click();
  await page.getByRole("button", { name: /Security/ }).click();
  await expect(page.getByText("Privileged data read").first()).toBeVisible();
  await expect(page.getByText(/Controller\./u).first()).toBeVisible();

  await page
    .getByLabel("Current authenticator code")
    .fill(generateTotpForTesting(e2eMfaSecret, new Date(Date.now() + 30_000)));
  await page.getByRole("button", { name: "Verify recent MFA" }).click();
  await expect(
    page.getByText(/High-risk actions are enabled for five minutes/iu),
  ).toBeVisible();

  const invitedEmail = `invited-${browserName}@example.test`;
  const invitedPassword = "a-new-browser-administrator-passphrase";
  await page.getByLabel("Administrator email").fill(invitedEmail);
  await page.getByRole("button", { name: "Invite administrator" }).click();
  const invitationLink = await page
    .getByLabel("One-time invitation link")
    .inputValue();
  expect(invitationLink).toContain("?invitation=");
  await page.goto(invitationLink);
  await expect(
    page.getByRole("heading", { name: "Secure account setup" }),
  ).toBeVisible();
  const enrollmentUri = await page
    .getByLabel("Authenticator setup URI")
    .inputValue();
  const invitedMfaSecret = new URL(enrollmentUri).searchParams.get("secret");
  expect(invitedMfaSecret).toBeTruthy();
  await page.getByLabel("New password").fill(invitedPassword);
  await page
    .getByLabel("Current authenticator code")
    .fill(generateTotpForTesting(invitedMfaSecret!, new Date()));
  await page.getByRole("button", { name: "Complete secure setup" }).click();
  await expect(page.getByText(/account setup is complete/iu)).toBeVisible();
  const recoveryCode = await page
    .getByLabel("Recovery codes")
    .locator("code")
    .first()
    .textContent();
  expect(recoveryCode).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/u);
  await page
    .getByRole("link", { name: "I have stored the codes securely" })
    .click();
  await page.getByLabel("Email address").fill(invitedEmail);
  await page.getByLabel("Password").fill(invitedPassword);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await page.getByLabel("Single-use recovery code").fill(recoveryCode!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Editor", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Media/ }).click();
  await expect(
    page.getByRole("heading", { name: "Media library" }),
  ).toBeVisible();
  await expect(page.getByText("Regional forum excerpt")).toBeVisible();
  await page.getByRole("button", { name: "Edit metadata and crop" }).click();
  const mediaEditor = page.getByRole("region", {
    name: /Edit amanor\/speaking\/forum-2026/,
  });
  await mediaEditor.getByLabel("Credit").fill("Browser-verified credit");
  await mediaEditor.getByRole("button", { name: "Save metadata" }).click();
  await expect(
    page.getByText("Governance and crop metadata saved."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(
    (await context.cookies("https://localhost:4210/v1/auth")).find(
      (cookie) => cookie.name === "__Secure-amanor_refresh",
    ),
  ).toBeUndefined();
});

test("operates a screened Protocol Desk request through review, decision and archival", async ({
  page,
  browserName,
}) => {
  const reference = e2eProtocolReference(browserName);
  await page.goto("https://localhost:3211/");
  await completeLiveLogin(page, e2eRoleEmail("desk_officer", browserName));
  await expect(page.getByText("Desk officer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Protocol Desk/ }).click();
  await expect(
    page.getByRole("heading", { name: "Operational health" }),
  ).toBeVisible();
  await expect(page.getByText("Overdue 48-hour responses")).toBeVisible();
  await page.getByLabel("Availability starts").fill("2030-01-01T09:00");
  await page.getByLabel("Availability ends").fill("2030-01-01T11:00");
  await page.getByRole("button", { name: "Check availability" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await page
    .getByRole("row", { name: new RegExp(reference) })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Capital Partnership Roundtable ${browserName}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Next state").getByRole("option", { name: "Accepted" }),
  ).toHaveCount(0);
  await expectTransitionOptions(page, ["awaiting_decision"]);

  await page.getByLabel("Assign to").fill(`desk-${browserName}`);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    page.getByText(`desk-${browserName}`, { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Internal note")
    .fill("Host identity and invitation authority verified.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByText("Host identity and invitation authority verified.", {
      exact: true,
    }),
  ).toBeVisible();
  const conflictFlag = page
    .getByRole("article")
    .filter({ hasText: "conflictGoverned counterparty" });
  await conflictFlag
    .getByLabel("Clearance reason")
    .fill("Governed partner relationship reviewed and cleared.");
  await conflictFlag.getByRole("button", { name: "Clear flag" }).click();
  await expect(
    page.getByText(
      /Cleared by .*Governed partner relationship reviewed and cleared\./,
    ),
  ).toBeVisible();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Desk review complete and ready for Principal decision.");
  await page.getByRole("button", { name: "Apply transition" }).click();
  await expect(
    page.getByText("screened → awaiting_decision", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Speaker-side contact")
    .fill(`Amanor Protocol Desk ${browserName}`);
  await page
    .getByLabel("Speaker-side email")
    .fill(`protocol-${browserName}@example.test`);
  await page
    .getByRole("button", { name: "Save Protocol Note configuration" })
    .click();
  await expect(page.getByLabel("Speaker-side contact")).toHaveValue(
    `Amanor Protocol Desk ${browserName}`,
  );
  await failPrincipalDecisionDelivery(reference);
  await page.getByRole("button", { name: "Sign out" }).click();

  await completeLiveLogin(page, e2eRoleEmail("principal", browserName));
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Protocol Desk/ }).click();
  await page
    .getByRole("row", { name: new RegExp(reference) })
    .getByRole("button", { name: "Open" })
    .click();
  const principalDelivery = page
    .getByRole("listitem")
    .filter({ hasText: "Protocol Note and decision links" });
  await expect(principalDelivery).toContainText("failed · 2 attempts");
  await expect(principalDelivery).not.toContainText("Resend returned HTTP 503");
  await principalDelivery
    .getByRole("button", { name: "Retry Principal delivery" })
    .click();
  await expect(principalDelivery).toContainText("pending · 0 attempts");
  await expect(
    page.getByText("Principal decision delivery retry requested", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    principalDelivery.getByRole("button", {
      name: "Retry Principal delivery",
    }),
  ).toHaveCount(0);
  await page.getByLabel("Next state").selectOption("accepted");
  await expectTransitionOptions(page, [
    "info_requested",
    "held",
    "accepted",
    "declined",
  ]);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Invitation approved in personal capacity.");
  await page.getByRole("button", { name: "Apply transition" }).click();
  await expect(
    page.getByText("awaiting_decision → accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Invitation approved in personal capacity.", {
      exact: true,
    }),
  ).toBeVisible();
  await failAcceptanceCorrespondence(reference);
  await failCalendarSync(reference);
  await page.getByRole("button", { name: "Close" }).click();
  await page
    .getByRole("row", { name: new RegExp(reference) })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(
    page.getByText("Calendar adapter returned HTTP 503"),
  ).toBeVisible();
  await expect(page.getByText("failed · 2 attempts")).toBeVisible();
  await page.getByRole("button", { name: "Retry delivery" }).click();
  await expect(
    page.getByText("Correspondence retry requested", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry delivery" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry calendar sync" }).click();
  await expect(page.getByText("pending · 0 attempts")).toBeVisible();
  await expect(
    page.getByText("Calendar synchronization retry requested", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry calendar sync" }),
  ).toHaveCount(0);

  await page.getByLabel("Next state").selectOption("contracted");
  await expectTransitionOptions(page, ["contracted"]);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Rider and engagement logistics agreed with the host.");
  await page.getByRole("button", { name: "Apply transition" }).click();
  await expect(
    page.getByText("accepted → contracted", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Next state").selectOption("delivered");
  await expectTransitionOptions(page, ["delivered"]);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Engagement completed after the governed event end time.");
  await page.getByRole("button", { name: "Apply transition" }).click();
  await expect(
    page.getByText("contracted → delivered", { exact: true }),
  ).toBeVisible();
  const followUp = page.getByRole("listitem").filter({ hasText: "follow up" });
  await expect(followUp).toHaveCount(1);
  await expect(followUp).toContainText("en-GB · pending");

  await page.getByLabel("Next state").selectOption("archived");
  await expectTransitionOptions(page, ["archived"]);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Follow-up evidence recorded and engagement closed.");
  await page.getByRole("button", { name: "Apply transition" }).click();
  await expect(
    page.getByText("delivered → archived", { exact: true }),
  ).toBeVisible();
  await expect(followUp).toHaveCount(1);
  await expect(page.getByLabel("Next state")).toHaveCount(0);
  await expect(
    page.getByText(
      "No lifecycle transition is available for this role and state.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: /Content/ }).click();
  await page.getByLabel("Content type").selectOption("signal");
  await page.getByLabel("Document ID").fill(`policy-signal-${browserName}`);
  await page.getByRole("button", { name: "Open document" }).click();
  await page.getByRole("button", { name: /Version 1/ }).click();
  const mandatoryPolicyReview = page.getByLabel(
    "Independent review required by Signal policy tags",
  );
  await expect(mandatoryPolicyReview).toBeChecked();
  await expect(mandatoryPolicyReview).toBeDisabled();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByRole("region", { name: "Content" }).getByRole("alert"),
  ).toContainText("different approver");

  await page.getByLabel("Content type").selectOption("page");
  await page.getByLabel("Document ID").fill(`takedown-${browserName}`);
  await page.getByRole("button", { name: "Open document" }).click();
  await page.getByRole("button", { name: /Version 1/ }).click();
  await page.getByRole("button", { name: "Audit trail" }).click();
  await expect(page.getByText(/Chain valid: 1 event verified/)).toBeVisible();
  await page.getByRole("button", { name: "Prepare unpublish" }).click();
  await page.getByRole("button", { name: "Confirm en-GB takedown" }).click();
  await expect(
    page.getByText(/en-GB publication removed.*takedown is audited/i),
  ).toBeVisible();
  await page.getByRole("button", { name: "Audit trail" }).click();
  await expect(page.getByText(/Chain valid: 2 events verified/)).toBeVisible();
  await expect(page.getByText("unpublished", { exact: true })).toBeVisible();
});
