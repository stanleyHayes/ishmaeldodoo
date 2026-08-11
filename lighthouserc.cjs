module.exports = {
  ci: {
    collect: {
      startServerCommand: "PORT=3310 npm run start --workspace=@amanor/web",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 120000,
      url: [
        "http://localhost:3310/?lite=1",
        "http://localhost:3310/record/atlas",
        "http://localhost:3310/record/atlas/table?lite=1",
        "http://localhost:3310/press?lite=1",
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--headless --no-sandbox --disable-dev-shm-usage",
        preset: "desktop",
        // Preview and local builds are intentionally noindex; production-indexing
        // behavior is covered by the robots/sitemap contract and browser tests.
        skipAudits: ["is-crawlable"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 1800 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.05 }],
        "total-byte-weight": ["error", { maxNumericValue: 512000 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
