# Performance budget evidence

Brief section 10.4 is the authority. The local and CI gates deliberately separate deterministic lab evidence from evidence that requires a deployed provider, field traffic or physical hardware.

## Enforced on every change

- `npm run check:sahel-budget` production-builds the public app and measures compressed HTML plus every referenced local static asset for all 18 approved English routes and their 18 French counterparts. Every `?lite=1` route must remain at or below 200 KiB. This includes P01-P13, Sources and all three legal pages.
- `npm run test:lighthouse` runs production Lighthouse against the zero-script Home and Press Sahel paths, the semantic Atlas Sahel table and the interactive Leaflet Atlas. All reports require accessibility 100, LCP at most 1.8 seconds and CLS at most 0.05. Sahel reports require at most 200 KiB; non-Atlas scripts require at most 120 KiB; interactive Atlas requires at most 500 KiB and Lighthouse time-to-interactive at most 2.5 seconds.
- `npm run check:standard-script-budget` measures the gzip-compressed modern script tags emitted by the production build for 18 English and 18 French non-Atlas routes. All currently miss the brief's 120 KiB target. Until D11 is signed, the gate prevents further regression above 145 KiB for ordinary routes and 215 KiB for the cryptographic Room; those interim ceilings are controls, not approved launch budgets.
- The Atlas is exempt only from the 120 KiB JavaScript ceiling. Its table twin is not exempt from the universal Sahel total-weight ceiling.

The Sahel byte gate is intentionally broader than Lighthouse. Lighthouse supplies deeper representative lab diagnostics; the deterministic production-asset walk prevents an untested public route or locale from silently exceeding the universal low-bandwidth ceiling.

## Evidence still required

Representative standard-route Lighthouse measurements transfer 147.8-154.6 KiB of script. The deterministic production-tag measurement is 136.1-143.7 KiB for ordinary routes and 211.1 KiB for the encrypted Room. The React/Next App Router runtime makes the original 120 KiB target unattainable through route-level tree-shaking alone. Controlled decision D11 requires the Principal, Product and Engineering to select a no-JavaScript delivery design, a signed revised ceiling or a public rendering-architecture change. No interim ceiling is represented as a waiver.

Lighthouse does not produce a trustworthy Interaction to Next Paint value without real interactions, and CI-host timing is not equivalent to the brief's Moto G Power target. The 150 ms INP requirement therefore remains open until Privacy approves bounded Core Web Vitals collection and production-like staging has both a real mid-range Android interaction run and sufficient field data. WebPageTest trend evidence and the physical 2G/4G device report also remain open. No local Lighthouse number is represented as that external evidence.
