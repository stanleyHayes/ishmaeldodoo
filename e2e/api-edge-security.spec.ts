import { expect, test } from "@playwright/test";
import { generateTotpForTesting } from "../apps/api/src/modules/auth/domain/mfa";
import { e2eEdgeEmail, e2eMfaSecret, e2ePassword } from "./auth-fixture";

const apiOrigin = "https://localhost:4210";
const adminOrigin = "https://localhost:3211";
const publicOrigin = "https://localhost:3210";
const lookalikeAdminOrigin = "https://localhost:3211.evil.example";

test("enforces exact credentialed CORS and rejects cross-site privileged mutations", async ({
  page,
  request,
  browserName,
}) => {
  const allowedPreflight = await request.fetch(`${apiOrigin}/v1/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: adminOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  expect(allowedPreflight.status()).toBe(204);
  expect(allowedPreflight.headers()["access-control-allow-origin"]).toBe(
    adminOrigin,
  );
  expect(allowedPreflight.headers()["access-control-allow-credentials"]).toBe(
    "true",
  );

  for (const origin of [publicOrigin, lookalikeAdminOrigin]) {
    const deniedPreflight = await request.fetch(`${apiOrigin}/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(deniedPreflight.headers()).not.toHaveProperty(
      "access-control-allow-origin",
    );
    expect(deniedPreflight.headers()).not.toHaveProperty(
      "access-control-allow-credentials",
    );
  }

  await page.goto(`${publicOrigin}/`);
  await expect(
    page.evaluate(async (url) => {
      try {
        await fetch(url, { credentials: "include" });
        return "unexpected-success";
      } catch (error) {
        return error instanceof TypeError ? "cors-blocked" : "other-error";
      }
    }, `${apiOrigin}/v1/health/live`),
  ).resolves.toBe("cors-blocked");

  await page.goto(`${adminOrigin}/`);
  await expect(
    page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return { status: response.status, ok: response.ok };
    }, `${apiOrigin}/v1/health/live`),
  ).resolves.toEqual({ status: 200, ok: true });

  const login = await request.post(`${apiOrigin}/v1/auth/login`, {
    headers: { Origin: adminOrigin },
    data: {
      email: e2eEdgeEmail(browserName),
      password: e2ePassword,
      mfaCode: generateTotpForTesting(
        e2eMfaSecret,
        new Date(Date.now() + 30_000),
      ),
    },
  });
  expect(login.status()).toBe(200);
  const accessToken = (await login.json()) as { accessToken: string };

  const deniedMutation = await request.post(
    `${apiOrigin}/v1/cms/content/source/cross-origin-proof/versions`,
    {
      headers: {
        Authorization: `Bearer ${accessToken.accessToken}`,
        Origin: lookalikeAdminOrigin,
      },
      data: {
        payload: {
          ref: "cross-origin-proof",
          title: "Cross-origin proof",
          publisher: "Security fixture",
          accessedAt: "2026-08-10T00:00:00.000Z",
          type: "firstParty",
        },
      },
    },
  );
  expect(deniedMutation.status()).toBe(403);
  const denial = (await deniedMutation.json()) as Record<string, unknown>;
  expect(denial).toMatchObject({ statusCode: 403 });
  expect(JSON.stringify(denial)).not.toContain(lookalikeAdminOrigin);
  expect(JSON.stringify(denial)).not.toContain("cross-origin-proof");
});
