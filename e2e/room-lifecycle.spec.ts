import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { generateTotpForTesting } from "../apps/api/src/modules/auth/domain/mfa";
import {
  e2eMfaSecret,
  e2ePassword,
  e2eRoomDeniedEmail,
  e2eRoomMongoUri,
  e2eRoomPrincipalEmail,
} from "./auth-fixture";

test("encrypts in the public browser and decrypts only in the Principal Room client", async ({
  page,
  browserName,
}) => {
  const privateJwk = process.env.E2E_ROOM_RECIPIENT_PRIVATE_JWK;
  if (!privateJwk) throw new Error("The E2E Room recipient key is unavailable");

  const message = `Confidential browser lifecycle evidence for ${browserName}; this plaintext must never cross the public network boundary.`;
  const subject = `Room lifecycle ${browserName}`;
  let transmittedBody = "";
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url() === "https://localhost:3210/api/room/enquiries"
    ) {
      transmittedBody = request.postData() ?? "";
    }
  });

  await page.goto("https://localhost:3210/contact/room");
  await expect(page.getByRole("heading", { name: "The Room" })).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await page.getByLabel("Your name").fill("Confidential Correspondent");
  await page
    .getByLabel("Your email address")
    .fill(`room-${browserName}@example.test`);
  await page.getByLabel("Organisation (optional)").fill("Example Institution");
  await page.getByLabel("Subject").fill(subject);
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(message);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Encrypt and send" }).click();

  const reference = (
    await page.locator(".room__reference").textContent()
  )?.trim();
  expect(reference).toMatch(/^RM-[0-9]{4}-[A-Z2-7]{16}$/u);
  expect(transmittedBody).not.toContain(message);
  expect(transmittedBody).not.toContain(subject);
  expect(transmittedBody).not.toContain(`room-${browserName}@example.test`);
  expect(transmittedBody).toContain('"ciphertext"');

  const roomConnection = await mongoose
    .createConnection(e2eRoomMongoUri)
    .asPromise();
  try {
    const stored = await roomConnection.db
      ?.collection("room_enquiries")
      .findOne({ reference });
    expect(stored).toBeTruthy();
    const serialised = JSON.stringify(stored);
    expect(serialised).not.toContain(message);
    expect(serialised).not.toContain(subject);
    expect(serialised).not.toContain(`room-${browserName}@example.test`);
    expect(stored?.envelope).toMatchObject({
      recipientKeyId: "rk-e2e-principal-2026",
      ciphertext: expect.any(String),
    });
  } finally {
    await roomConnection.close();
  }

  await page.goto("https://localhost:3211/");
  await page
    .getByLabel("Email address")
    .fill(e2eRoomPrincipalEmail(browserName));
  await page.getByLabel("Password").fill(e2ePassword);
  await page
    .getByLabel("Authenticator code")
    .fill(generateTotpForTesting(e2eMfaSecret, new Date(Date.now() + 30_000)));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Open The Room" }).click();

  await expect(page.getByRole("heading", { name: "The Room" })).toBeVisible();
  const enquiry = page.locator("li.room-item").filter({ hasText: reference! });
  await expect(enquiry).toBeVisible();
  await page.getByLabel("Key identifier").fill("rk-e2e-principal-2026");
  await page.getByLabel("Private key (JWK)").fill(privateJwk);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText(/Unlocked as/iu)).toContainText(
    "rk-e2e-principal-2026",
  );
  await enquiry.getByRole("button", { name: "Open" }).click();

  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close and clear" }).click();
  await expect(page.getByText(message, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Lock now" }).click();
  await expect(enquiry.getByRole("button", { name: "Open" })).toBeDisabled();

  const auditConnection = await mongoose
    .createConnection(e2eRoomMongoUri)
    .asPromise();
  try {
    await expect
      .poll(async () =>
        auditConnection.db?.collection("room_events").findOne({
          action: "room_ciphertext_released",
          actorId: `room-principal-${browserName}`,
          reference,
        }),
      )
      .toBeTruthy();
  } finally {
    await auditConnection.close();
  }
});

test("denies a Desk Officer without revealing Room state and records the attempt", async ({
  request,
  browserName,
}) => {
  const actorId = `room-denied-${browserName}`;
  const login = await request.post("https://localhost:4210/v1/auth/login", {
    headers: { Origin: "https://localhost:3211" },
    data: {
      email: e2eRoomDeniedEmail(browserName),
      password: e2ePassword,
      mfaCode: generateTotpForTesting(
        e2eMfaSecret,
        new Date(Date.now() + 30_000),
      ),
    },
  });
  expect(login.ok()).toBe(true);
  const body = (await login.json()) as { accessToken: string };

  const denied = await request.get("https://localhost:4210/v1/room/enquiries", {
    headers: { Authorization: `Bearer ${body.accessToken}` },
  });
  expect(denied.status()).toBe(403);
  await expect(denied.json()).resolves.toMatchObject({
    statusCode: 403,
    message: "Room access is not permitted",
  });

  const roomConnection = await mongoose
    .createConnection(e2eRoomMongoUri)
    .asPromise();
  try {
    await expect
      .poll(async () =>
        roomConnection.db?.collection("room_events").findOne({
          action: "room_access_denied",
          actorId,
          reference: null,
        }),
      )
      .toBeTruthy();
  } finally {
    await roomConnection.close();
  }
});
