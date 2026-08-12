import { expect, test, type Page } from "@playwright/test";

async function useStandardMode(page: Page): Promise<void> {
  const destination = new URL(page.url());
  destination.searchParams.delete("lite");
  destination.searchParams.delete("mode");
  const returnPath = `${destination.pathname}${destination.search}${destination.hash}`;
  await page.goto(
    `${destination.origin}/api/lite?enabled=0&return=${encodeURIComponent(returnPath)}`,
  );
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "lite");
}

test("keeps analytics optional, bilingual and usable on a narrow night-mode viewport", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("https://localhost:3210/");
  await useStandardMode(page);
  const notice = page.getByRole("complementary", {
    name: "Privacy-respecting measurement",
  });
  await expect(notice).toBeVisible();
  await expect(
    notice.getByRole("button", { name: "Allow measurement" }),
  ).toBeVisible();
  await expect(notice.getByRole("button", { name: "Decline" })).toBeVisible();
  expect(
    await page.evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
  ).toBe(true);

  await notice.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("No analytics", { exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "lite");
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "amanor-analytics",
    )?.value,
  ).toBe("denied");
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "lite");
  await expect(
    page.getByRole("complementary", { name: "Privacy-respecting measurement" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Allow measurement" }).click();
  await expect(page.getByText("Anonymous analytics enabled")).toBeVisible();
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "amanor-analytics",
    )?.value,
  ).toBe("granted");
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "amanor-lite")
      ?.value,
  ).toBe("dismissed");

  await page.goto("https://localhost:3210/api/theme?theme=night&return=%2Ffr");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(page.getByText("Mesure anonyme activée")).toBeVisible();
  expect(
    await page.evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
  ).toBe(true);
});

test("keeps the global Search utility bilingual, public-only and connected to specialist search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("https://localhost:3210/");
  await useStandardMode(page);
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL("https://localhost:3210/search");
  await expect(
    page.getByRole("heading", { level: 1, name: "Search" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/u,
  );
  await page.getByLabel("Search the site").fill("source register");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=source(?:\+|%20)register$/u);
  await expect(
    page.getByRole("link", { name: "Source Register", exact: true }),
  ).toHaveAttribute("href", "/record/sources");
  await expect(
    page.getByRole("link", { name: "Search Archive transcripts" }),
  ).toHaveAttribute("href", "/archive?q=source%20register");
  await expect(
    page.locator(
      '.search-results a[href^="/admin"], .search-results a[href="/contact/room"], .search-results a[href^="/protocol-decision"]',
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
  ).toBe(true);

  await page.goto("https://localhost:3210/fr");
  await useStandardMode(page);
  await page.getByRole("link", { name: "Recherche", exact: true }).click();
  await expect(page).toHaveURL("https://localhost:3210/fr/search");
  await page.getByLabel("Rechercher sur le site").fill("confidentialité");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Avis de confidentialité" }),
  ).toHaveAttribute("href", "/fr/legal/privacy");
  await expect(
    page.getByRole("link", {
      name: "Rechercher dans les transcriptions des archives",
    }),
  ).toHaveAttribute("href", "/fr/archive?q=confidentialit%C3%A9");
});

test("keeps French punctuation non-breaking across public routes", async ({
  page,
}) => {
  const failures: string[] = [];
  for (const route of [
    "/fr",
    "/fr/record",
    "/fr/record/atlas",
    "/fr/record/atlas/table",
    "/fr/record/sources",
    "/fr/speaking",
    "/fr/speaking/request",
    "/fr/signals",
    "/fr/doctrine",
    "/fr/archive",
    "/fr/legacy",
    "/fr/office-hours",
    "/fr/selah",
    "/fr/press",
    "/fr/press/contact",
    "/fr/contact",
    "/fr/contact/room",
    "/fr/legal/privacy",
    "/fr/legal/terms",
    "/fr/legal/disclosure",
  ]) {
    await page.goto(`https://localhost:3210${route}`);
    await useStandardMode(page);
    const offenders = (await page.evaluate(`(() => {
      const rejected = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
        const text = node.textContent || "";
        if (/ (?=[:;!?»])|« |[\\p{L}\\p{M}][:;!?]/u.test(text))
          rejected.push(text.trim());
      }
      return rejected;
    })()`)) as string[];
    failures.push(...offenders.map((text) => `${route}: ${text}`));
  }
  expect(failures, "breakable French punctuation").toEqual([]);
});

test("renders the three bilingual CMS-backed legal pages with reciprocal metadata", async ({
  page,
}) => {
  const pages = [
    {
      path: "/legal/privacy",
      frenchPath: "/fr/legal/privacy",
      heading: "Privacy notice",
      frenchHeading: "Avis de confidentialité",
      section: "Your data rights",
      frenchSection: "Vos droits sur les données",
    },
    {
      path: "/legal/terms",
      frenchPath: "/fr/legal/terms",
      heading: "Terms of use",
      frenchHeading: "Conditions d’utilisation",
      section: "Responsible use",
      frenchSection: "Utilisation responsable",
    },
    {
      path: "/legal/disclosure",
      frenchPath: "/fr/legal/disclosure",
      heading: "Independence disclosure",
      frenchHeading: "Déclaration d’indépendance",
      section: "Personal capacity",
      frenchSection: "Capacité personnelle",
    },
  ] as const;

  for (const legalPage of pages) {
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`https://localhost:3210${legalPage.path}`);
      await useStandardMode(page);
      await expect(
        page.getByRole("heading", { level: 1, name: legalPage.heading }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: legalPage.section }),
      ).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${legalPage.path}$`, "u"),
      );
      await expect(
        page.locator('link[rel="alternate"][hreflang="fr-FR"]'),
      ).toHaveAttribute("href", new RegExp(`${legalPage.frenchPath}$`, "u"));
      expect(
        await page.evaluate(
          "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
        ),
      ).toBe(true);
    }

    await page.goto(`https://localhost:3210${legalPage.frenchPath}`);
    await useStandardMode(page);
    await expect(
      page.getByRole("heading", { level: 1, name: legalPage.frenchHeading }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: legalPage.frenchSection }),
    ).toBeVisible();
    await expect(
      page.locator('link[rel="alternate"][hreflang="en-GB"]'),
    ).toHaveAttribute("href", new RegExp(`${legalPage.path}$`, "u"));
  }

  const footer = page.getByRole("contentinfo");
  await expect(
    footer.getByRole("link", { name: "Confidentialité" }),
  ).toHaveAttribute("href", "/fr/legal/privacy");
  await expect(
    footer.getByRole("link", { name: "Conditions" }),
  ).toHaveAttribute("href", "/fr/legal/terms");
  await expect(
    footer.getByRole("link", { name: "Déclaration" }),
  ).toHaveAttribute("href", "/fr/legal/disclosure");
});

test("renders the published bilingual Signal Board with governed ledger semantics", async ({
  page,
}) => {
  await page.goto("https://localhost:3210/signals");
  await useStandardMode(page);
  await expect(
    page.getByRole("heading", { level: 2, name: "Signal Board" }),
  ).toBeVisible();
  await expect(page.getByText("1 in the Foresight Ledger")).toBeVisible();
  const signal = page.locator("#published-signal-e2e");
  await expect(signal.getByText("Calling it")).toBeVisible();
  await expect(signal.getByText("What would change the view")).toBeVisible();
  await expect(signal.getByText(/Review due:/)).toBeVisible();
  await expect(
    signal.getByRole("link", { name: "source-e2e" }),
  ).toHaveAttribute("href", "/record/sources#source-e2e");

  await page.goto("https://localhost:3210/fr/signals");
  await expect(
    page.getByRole("heading", { level: 2, name: "Tableau des signaux" }),
  ).toBeVisible();
  await expect(page.getByText("1 dans le registre prospectif")).toBeVisible();
  await expect(page.locator("#published-signal-e2e")).toContainText(
    "Des preuves contraires substantielles",
  );
});

test("renders only the consent-safe bilingual Legacy scholar projection", async ({
  page,
}) => {
  await page.goto("https://localhost:3210/legacy");
  await useStandardMode(page);
  await expect(
    page.getByRole("heading", { level: 2, name: "Scholar journeys" }),
  ).toBeVisible();
  await expect(page.getByText("Ama Mensah")).toBeVisible();
  const portrait = page.getByRole("img", {
    name: "Ama Mensah at the university library",
  });
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute("src", /res\.cloudinary\.com/);
  await expect(
    page.locator(".legacy-portrait figcaption", {
      hasText: "Project AMANOR · Consent-cleared editorial use",
    }),
  ).toBeVisible();
  await expect(page.getByText(/not a financial impact report/i)).toBeVisible();
  await expect(page.getByText(/consent version/i)).toHaveCount(0);

  await page.goto("https://localhost:3210/fr/legacy");
  await expect(
    page.getByRole("heading", { level: 2, name: "Parcours des chercheurs" }),
  ).toBeVisible();
  await expect(page.getByText("Économie publique")).toBeVisible();
  await expect(
    page.getByText(/ne constitue pas un rapport d’impact financier/i),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Ama Mensah à la bibliothèque universitaire",
    }),
  ).toBeVisible();

  await page.goto("https://localhost:3210/legacy?mode=lite");
  await expect(page.getByText("Ama Mensah")).toBeVisible();
  await expect(page.getByText("A consent-cleared public story.")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Ama Mensah at the university library/i }),
  ).toHaveCount(0);
});

test("keeps the bilingual Source Register searchable and excludes editorial notes", async ({
  page,
}) => {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/record/sources");
    await expect(
      page.getByRole("heading", { name: "The sources behind the record." }),
    ).toBeVisible();
    await expect(page.locator("#source-e2e")).toContainText(
      "Regional delivery record",
    );
    await expect(page.locator("#source-homepage")).toContainText(
      "Homepage evidence record",
    );
    await expect(page.getByText(/Internal verification note/iu)).toHaveCount(0);
    await expect(page.getByText(/Private provenance review/iu)).toHaveCount(0);
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
    ).toBe(true);
  }

  await page
    .getByLabel("Search by title, publisher or reference")
    .fill("Regional delivery");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=Regional\+delivery/u);
  await expect(page.locator("#source-e2e")).toBeVisible();
  await expect(page.locator("#source-homepage")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open source" })).toHaveAttribute(
    "href",
    "https://evidence.example.test/regional-delivery",
  );

  await page.goto("https://localhost:3210/fr/record/sources?q=Independent");
  await expect(
    page.getByRole("heading", { name: "Les sources derrière le parcours." }),
  ).toBeVisible();
  await expect(page.locator("#source-homepage")).toContainText(
    "Independent Archive",
  );
  await expect(page.locator("#source-e2e")).toHaveCount(0);
  await expect(
    page.getByText(/Private provenance review detail/iu),
  ).toHaveCount(0);
});

test("keeps the public design system usable in day and night at every required width", async ({
  page,
}) => {
  await page.goto("https://localhost:3210/");
  await useStandardMode(page);
  await page
    .getByRole("complementary", { name: "Privacy-respecting measurement" })
    .getByRole("button", { name: "Decline" })
    .click();

  const palettes: Record<string, { background: string; color: string }> = {};
  for (const theme of ["day", "night"] as const) {
    await page.goto(
      `https://localhost:3210/api/theme?theme=${theme}&return=%2F`,
    );
    if (theme === "night") {
      await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    } else {
      await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    }
    palettes[theme] = await page.evaluate(
      "({ background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color })",
    );

    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Primary navigation" })
          .getByRole("link"),
      ).toHaveCount(5);
      await expect(
        page.getByRole("link", { name: "Request an engagement" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
        ),
      ).toBe(true);
    }
  }

  expect(palettes.day).not.toEqual(palettes.night);
});

test("keeps the Lite homepage functional without downloading JavaScript", async ({
  page,
}) => {
  const response = await page.goto("https://localhost:3210/?lite=1", {
    waitUntil: "load",
  });
  expect(response?.headers()["content-security-policy"]).toContain(
    "script-src 'none'",
  );
  await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");
  await expect(page.getByText("No analytics in Lite mode")).toBeVisible();
  expect(
    await page.evaluate(
      "performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script').reduce((total, entry) => total + entry.transferSize, 0)",
    ),
  ).toBe(0);

  await page
    .getByRole("link", {
      name: "You are looking for structured, de-risked pipeline in Ghana. Choose",
    })
    .click();
  await expect(page).toHaveURL(/door=investor/u);
  await expect(page).toHaveURL(/lite=1/u);
  await expect(page.locator("[data-audience='investor']")).toBeVisible();
  await expect(
    page.getByLabel("Nine proof points").getByRole("link").first(),
  ).toContainText("Homepage proof 9");
  await expect(
    page.getByRole("button", { name: "Exit Lite mode" }),
  ).toBeVisible();
});

test("keeps the Lite Press Room functional without JavaScript", async ({
  page,
}, testInfo) => {
  const response = await page.goto("https://localhost:3210/press?lite=1", {
    waitUntil: "load",
  });
  expect(response?.headers()["content-security-policy"]).toContain(
    "script-src 'none'",
  );
  await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");
  await expect(
    page.getByRole("heading", { name: "Canonical identity" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Copy /u })).toHaveCount(0);
  await expect(page.locator("main img, main audio")).toHaveCount(0);
  expect(
    await page.evaluate(
      "performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script').reduce((total, entry) => total + entry.transferSize, 0)",
    ),
  ).toBe(0);

  const pressKit = page.locator("form[action='/api/press-kit']");
  await pressKit.getByLabel("Your name").fill("Ama Mensah");
  await pressKit.getByLabel("Outlet").fill("Lite Newsroom");
  await pressKit
    .getByLabel("Email address")
    .fill(`press-lite-${testInfo.project.name}@example.test`);
  const downloadPromise = page.waitForEvent("download");
  await pressKit.getByRole("button", { name: "Generate press kit" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^amanor-press-kit-.*\.pdf$/u);
  expect(await download.failure()).toBeNull();

  const dossier = page.locator("form[action='/api/living-dossier']");
  await expect(dossier.getByLabel("Purpose of the document")).toBeVisible();
  await expect(
    dossier.getByRole("button", { name: "Generate dossier" }),
  ).toBeVisible();
});

test("keeps the bilingual Press Room interactive across identity, downloads and media handoff", async ({
  page,
}, testInfo) => {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/press");
    await useStandardMode(page);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Dr Ishmael Nii Amanor Dodoo",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Canonical identity" }),
    ).toBeVisible();
    await expect(
      page.getByText("Current role · Independent platform"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "source-e2e" }),
    ).toHaveAttribute("href", "/record/sources#source-e2e");
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
    ).toBe(true);
  }

  const suffix = testInfo.project.name.replace(/[^a-z0-9]/giu, "-");
  const pressKit = page.locator("form.press-kit-form").first();
  await pressKit.getByLabel("Your name").fill("Ama Mensah");
  await pressKit.getByLabel("Outlet").fill("Public Evidence News");
  await pressKit
    .getByLabel("Email address")
    .fill(`press-${suffix}@example.test`);
  const pressKitDownload = page.waitForEvent("download");
  await pressKit.getByRole("button", { name: "Generate press kit" }).click();
  const pressKitFile = await pressKitDownload;
  expect(pressKitFile.suggestedFilename()).toMatch(
    /^amanor-press-kit-.*\.pdf$/u,
  );
  expect(await pressKitFile.failure()).toBeNull();

  const dossier = page.locator("section.living-dossier form");
  await dossier.getByLabel("Your name").fill("Ama Mensah");
  await dossier.getByLabel("Organisation").fill("Public Evidence News");
  await dossier
    .getByLabel("Email address")
    .fill(`dossier-${suffix}@example.test`);
  await dossier
    .getByLabel("Purpose of the document")
    .fill("Prepare a sourced briefing for an institutional interview.");
  const dossierDownload = page.waitForEvent("download");
  await dossier.getByRole("button", { name: "Generate dossier" }).click();
  const dossierFile = await dossierDownload;
  expect(dossierFile.suggestedFilename()).toMatch(
    /^amanor-.*dossier-.*\.pdf$/u,
  );
  expect(await dossierFile.failure()).toBeNull();

  await page.getByRole("link", { name: "Send a media enquiry" }).click();
  await expect(page).toHaveURL("https://localhost:3210/press/contact");
  await expect(
    page.getByRole("heading", { level: 1, name: "Media contact" }),
  ).toBeVisible();
  await expect(page.getByLabel("Deadline")).toBeVisible();

  await page.goto("https://localhost:3210/fr/press");
  await expect(
    page.getByRole("heading", { name: "Identité canonique" }),
  ).toBeVisible();
  await expect(
    page.getByText("Fonction actuelle · Plateforme indépendante"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copier" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "source-e2e" })).toHaveAttribute(
    "href",
    "/fr/record/sources#source-e2e",
  );
  await expect(
    page.getByRole("link", { name: "Envoyer une demande presse" }),
  ).toHaveAttribute("href", "/fr/press/contact");
});

test("defers governed speaking video until a Lite visitor opts in", async ({
  page,
}) => {
  await page.goto("https://localhost:3210/speaking?lite=1");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");

  const video = page.locator("video");
  const standardModeOptIn = page.getByRole("link", {
    name: "Load this media in standard mode",
  });
  await expect(standardModeOptIn).toBeVisible();
  await expect(video).toHaveCount(0);
  await expect(page.getByText("Regional forum excerpt").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Transcript and context" }),
  ).toHaveAttribute("href", "/archive#regional-broadcast");

  await standardModeOptIn.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "lite");
  await expect(video).toHaveAttribute(
    "src",
    "https://media.example.test/forum-2026.mp4",
  );
});

test("persists and resets an adaptive audience without hiding the public shell", async ({
  page,
  context,
}) => {
  await page.goto("https://localhost:3210/");
  await useStandardMode(page);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A record built to remain accurate",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link"),
  ).toHaveCount(5);
  await page
    .getByRole("link", { name: /structured, de-risked pipeline/i })
    .click();

  await expect(page).toHaveURL(/door=investor/u);
  await expect(page.locator("[data-audience='investor']")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("amanor-audience")),
    )
    .toBe("investor");
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "amanor-audience",
    )?.value,
  ).toBe("investor");

  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-mode", "lite");
  await expect(page.locator("[data-audience='investor']")).toBeVisible();
  await page.getByRole("link", { name: "Reset view" }).click();
  await expect(page.locator("[data-audience='general']")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("amanor-audience")),
    )
    .toBeNull();
});

test("changes locale safely and renders the approved four-act Record", async ({
  page,
}) => {
  await page.goto("https://localhost:3210/");
  await page.getByRole("link", { name: "FR", exact: true }).click();
  await expect(page).toHaveURL("https://localhost:3210/fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Une source conçue pour rester exacte",
  );
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toContainText("Le parcours");

  await page.goto("https://localhost:3210/record?lite=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A record in four acts",
  );
  await expect(
    page.getByRole("navigation", { name: "Story progress" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(
    page.getByRole("link", { name: "Load field images" }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "The Two Ledgers" }),
  ).toBeVisible();
});

test("Protocol Desk remains usable at every required width and resumes saved progress", async ({
  page,
}) => {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/speaking/request");
    await expect(
      page.getByRole("heading", { name: "Request an engagement" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Progress" }).getByRole("listitem"),
    ).toHaveCount(6);
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
    ).toBe(true);
  }
  await page.getByLabel(/personal capacity/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Organisation name").fill("African Finance Forum");
  await page.reload();
  await expect(page.getByText("Saved progress restored.")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "The organisation and your role" }),
  ).toBeVisible();
  await expect(page.getByLabel("Organisation name")).toHaveValue(
    "African Finance Forum",
  );
});

test("Archive filtering, chapters and transcripts remain usable across required widths", async ({
  page,
}) => {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/archive");
    await expect(
      page.getByRole("heading", { name: "Archive register" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("2 published result(s)");
    await expect(
      page.getByRole("navigation", {
        name: "Chapters for Regional investment broadcast",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
    ).toBe(true);
  }

  await page.getByLabel("Search").fill("Dakar");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=Dakar/u);
  await expect(page.getByRole("status")).toHaveText("1 published result(s)");
  await expect(
    page.getByRole("heading", { name: "Regional investment broadcast" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Public value in practice" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Play from here" }).nth(1),
  ).toHaveAttribute(
    "href",
    "https://media.example.test/regional-broadcast.mp4#t=90",
  );
  const transcriptSummary = page.getByText("Read transcript · corrected");
  const transcriptDetails = transcriptSummary.locator("..");
  if (
    !(await transcriptDetails.evaluate((element) =>
      element.hasAttribute("open"),
    ))
  )
    await transcriptSummary.click();
  await expect(
    page.getByText("A discussion of regional investment priorities."),
  ).toBeVisible();
  await page.getByLabel("Search").fill("regional investment priorities");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("link", { name: "Play at 1:30" }),
  ).toHaveAttribute(
    "href",
    "https://media.example.test/regional-broadcast.mp4#t=90",
  );
  await expect(
    page.getByRole("heading", { name: "Correction log" }),
  ).toBeVisible();
  if (
    !(await transcriptDetails.evaluate((element) =>
      element.hasAttribute("open"),
    ))
  )
    await transcriptSummary.click();
  const transcript = page.locator(".quotable-transcript > p").first();
  await transcript.selectText();
  await transcript.dispatchEvent("mouseup");
  await expect(
    page.getByRole("group", { name: "Copy selected citation" }),
  ).toBeVisible();

  await page.goto("https://localhost:3210/fr/archive?type=broadcast");
  await expect(
    page.getByRole("heading", { name: "Registre des archives" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", {
      name: "Chapitres de Émission sur l’investissement régional",
    }),
  ).toContainText("Priorités d’investissement");
  await expect(page.getByRole("status")).toHaveText("1 résultat(s) publié(s)");
});

test("Speaking themes remain bilingual, filterable and usable across required widths", async ({
  page,
}) => {
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://localhost:3210/speaking");
    await expect(
      page.getByRole("heading", {
        name: "Speaking themes matched to the right audience",
      }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("2 published themes");
    await expect(
      page.getByRole("link", { name: "Open the Protocol Desk" }),
    ).toHaveAttribute("href", "/speaking/request");
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      ),
    ).toBe(true);
  }

  await expect(page.getByText("Regional forum", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Public Value Forum · Accra, Ghana"),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://media.example.test/forum-2026.mp4",
  );
  await expect(
    page.getByRole("link", { name: "Transcript and context" }),
  ).toHaveAttribute("href", "/archive#regional-broadcast");
  const englishEvents = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts
        .map((script) => JSON.parse(script.textContent ?? "null"))
        .filter((entry) => entry?.["@type"] === "Event"),
    );
  expect(englishEvents).toHaveLength(4);
  expect(englishEvents).toContainEqual(
    expect.objectContaining({
      name: "Regional forum",
      inLanguage: "en-GB",
      url: "https://localhost:3210/speaking#public-value-forum-2026",
      eventStatus: "https://schema.org/EventCompleted",
    }),
  );

  await page.getByRole("combobox", { name: "Format" }).selectOption("workshop");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/format=workshop/u);
  await expect(page.getByRole("status")).toHaveText("1 published theme");
  await expect(
    page.getByRole("heading", { name: "Regional investment" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public value" })).toHaveCount(
    0,
  );

  await page.goto(
    "https://localhost:3210/fr/speaking?format=institutional_briefing",
  );
  await expect(page.getByRole("status")).toHaveText("1 thème publié");
  await expect(
    page.getByRole("heading", { name: "Valeur publique" }),
  ).toBeVisible();
  await expect(page.getByText("Thème à la une")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ouvrir le Bureau du protocole" }),
  ).toHaveAttribute("href", "/fr/speaking/request");
  const frenchEvents = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts
        .map((script) => JSON.parse(script.textContent ?? "null"))
        .filter((entry) => entry?.["@type"] === "Event"),
    );
  expect(frenchEvents).toHaveLength(2);
  expect(frenchEvents[0]).toMatchObject({
    inLanguage: "fr-FR",
    subjectOf: [
      {
        url: "https://localhost:3210/fr/record/sources#source-e2e",
      },
    ],
  });
});

test("general Contact stays distinct from specialist and confidential routes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 850 });
  await page.goto("https://localhost:3210/contact");
  await expect(
    page.getByRole("heading", { name: "Send a message" }),
  ).toBeVisible();
  await expect(page.getByText(/not The Room/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Protocol Desk" }),
  ).toHaveAttribute("href", "/speaking/request");
  await expect(
    page.getByText("Which contact route should I use?"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "source-e2e" })).toHaveAttribute(
    "href",
    "/record/sources#source-e2e",
  );
  const englishFaq = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts
        .map((script) => JSON.parse(script.textContent ?? "null"))
        .find((entry) => entry?.["@type"] === "FAQPage"),
    );
  expect(englishFaq).toMatchObject({
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Which contact route should I use?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Use this form for general messages, the Protocol Desk for invitations, and the media route for press enquiries.",
        },
      },
    ],
  });
  expect(
    await page.evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
  ).toBe(true);

  await page.getByLabel("Your name").fill("Ama Mensah");
  await page
    .getByLabel("Email address")
    .fill(`contact-${testInfo.project.name}@example.test`);
  await page.getByLabel("Enquiry type").selectOption("accessibility");
  await page.getByLabel("Subject").fill("Accessible document request");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Please provide an accessible version of the public document.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText(
    /Message received: GC-2026-/u,
  );

  await page.goto("https://localhost:3210/fr/contact");
  await expect(
    page.getByRole("heading", { name: "Envoyer un message" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Contact presse" }),
  ).toHaveAttribute("href", "/fr/press/contact");
  await expect(
    page.getByText("Quelle voie de contact dois-je utiliser ?"),
  ).toBeVisible();
  const frenchFaq = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts
        .map((script) => JSON.parse(script.textContent ?? "null"))
        .find((entry) => entry?.["@type"] === "FAQPage"),
    );
  expect(frenchFaq?.mainEntity[0]).toMatchObject({
    name: "Quelle voie de contact dois-je utiliser\u00a0?",
    acceptedAnswer: {
      text: "Utilisez ce formulaire pour les messages généraux, le Bureau du protocole pour les invitations et la voie presse pour les demandes des médias.",
    },
  });
});

test("submits a complete no-account Protocol Desk request to live NestJS and returns a reference", async ({
  page,
}) => {
  await page.goto("https://localhost:3210/speaking/request?lite=1");
  await page.getByLabel(/personal capacity/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const organisation = page.getByRole("group", {
    name: "The organisation and your role",
  });
  await organisation
    .getByLabel("Organisation name")
    .fill("African Finance Forum");
  await organisation
    .getByLabel("Organisation type")
    .selectOption("multilateral");
  await organisation.getByLabel("Country (2-letter code)").fill("GH");
  await organisation.getByLabel("Your name").fill("Ama Mensah");
  await organisation.getByLabel("Your role").fill("Director");
  await organisation.getByLabel("Work email").fill("ama@example.org");
  await page.getByRole("button", { name: "Continue" }).click();
  const engagement = page.getByRole("group", { name: "The engagement" });
  await engagement.getByRole("combobox").first().selectOption("keynote");
  await engagement.getByLabel("Event name").fill("Finance Forum");
  await engagement.getByLabel("Start date").fill("2026-12-01");
  await engagement.getByLabel("City").fill("Accra");
  await engagement.getByLabel("Country (2-letter code)").fill("GH");
  await engagement.getByLabel("Format").selectOption("in_person");
  await engagement.getByLabel("Language").selectOption("english");
  await engagement.getByLabel("Expected audience size").fill("200");
  await engagement
    .getByLabel(/Who will be in the room/)
    .fill("Senior public and private finance leaders");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("Proposed theme or title")
    .fill("Financing transformation");
  await page
    .getByLabel(/What should the audience leave with/)
    .fill("Understand practical routes from ambition to investment.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("Travel and accommodation")
    .selectOption("host_covered");
  await page.getByLabel("Honorarium").selectOption("discuss");
  await page.getByLabel("On-the-ground contact").fill("Kojo Annan");
  await page.getByLabel("Contact phone").fill("+233200000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/approximately 200/)).toBeVisible();
  await page.getByLabel(/consent to this data/).check();
  await page.getByLabel(/authorised to invite/).check();
  await page.getByRole("button", { name: "Submit invitation" }).click();
  await expect(
    page.getByRole("heading", { name: "Your request has been received" }),
  ).toBeVisible();
  await expect(page.getByText(/^PD-\d{4}-\d{4,}$/u)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "lite");
});

test("rejects oversized public bodies before form processing", async ({
  request,
}) => {
  const response = await request.post(
    "https://localhost:4210/v1/public/contact-enquiries",
    {
      data: {
        name: "Load test",
        email: "load@example.test",
        category: "general",
        subject: "Bounded request body",
        message: "x".repeat(40 * 1024),
        locale: "en-GB",
        privacyConsent: true,
      },
    },
  );
  expect(response.status()).toBe(413);
  expect(await response.text()).not.toContain("x".repeat(100));
});

test("rejects operator-shaped public input without reflecting it", async ({
  request,
}) => {
  const marker = "<script>operator-marker</script>";
  const response = await request.post(
    "https://localhost:4210/v1/public/contact-enquiries",
    {
      data: {
        name: "Security test",
        email: "security@example.test",
        category: "general",
        subject: "Input validation",
        message: marker,
        locale: "en-GB",
        privacyConsent: true,
        $where: marker,
      },
    },
  );
  expect([400, 429]).toContain(response.status());
  expect(await response.text()).not.toContain(marker);
});
