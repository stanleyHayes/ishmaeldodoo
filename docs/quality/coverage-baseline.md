# Unit and component coverage baseline

Baseline date: 9 August 2026.

Coverage uses Vitest's V8 provider and includes every production TypeScript/TSX source file in each application, including files with zero executed lines. Tests and declaration files are excluded; the NestJS process entry point is excluded because application bootstrap is exercised by the separate real-Mongo integration suite.

| Application | Statements | Branches | Functions |  Lines | Enforced floor (S/B/F/L) |
| ----------- | ---------: | -------: | --------: | -----: | -----------------------: |
| Admin/CMS   |     74.54% |   68.25% |    67.01% | 75.97% |              73/67/66/74 |
| NestJS API  |     62.93% |   58.30% |    57.69% | 64.61% |              61/57/56/63 |
| Public web  |     61.69% |   52.04% |    65.51% | 67.51% |              60/51/64/66 |

The floors are intentional non-regression guards, not target completion percentages. New production files enter the denominator automatically. Any reduction below a floor fails `npm run check`; raising a floor requires a verified coverage run and an update to this document. Critical authentication, publication, public-office policy, payment, encryption or destructive operations still require direct behavioural tests regardless of aggregate percentage.

Run locally with:

```sh
npm run test:coverage
```

Every app runs coverage through `scripts/run-coverage.mjs`. The runner takes an
atomic, process-owned lock for that app before Vitest can clean or write its
shared `coverage` directory. A concurrent run is refused with the live holder's
name instead of corrupting either report; a lock left by a terminated process is
reclaimed. `npm run check:concurrency-guards` exercises live-holder refusal,
same-process refusal and stale-holder recovery, and is part of the canonical
root gate.

CI retains `apps/admin/coverage/coverage-summary.json`, `apps/api/coverage/coverage-summary.json` and `apps/web/coverage/coverage-summary.json` as the `coverage-summaries` artifact. HTML reports are intentionally not generated or retained because the compact machine-readable summaries are sufficient for trend review and avoid unnecessary CI storage.
