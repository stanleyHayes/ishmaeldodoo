# Browser, device and network matrix

- Scope: AMANOR-138
- Automated status: Chromium Android viewport/touch plus 3G/2G network emulation passes
- Acceptance status: physical device lab not run

## Evidence classes

Emulation is valuable regression evidence, but it does not reproduce a handset’s CPU, memory pressure, GPU, radio variability, thermal behavior, browser chrome or Samsung Internet’s Chromium fork. It must never be relabelled as physical-device evidence. The Playwright attachment names its evidence class `chromium-emulation-not-physical-device`.

| Surface                                                            | Browser/device                                       | Network                                         | Evidence                                            | Status                              |
| ------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| Public/Admin core journeys                                         | Desktop Chromium                                     | Unthrottled                                     | Playwright                                          | Automated pass                      |
| Public/Admin core journeys                                         | Desktop Firefox                                      | Unthrottled                                     | Playwright                                          | Automated pass                      |
| Public/Admin core journeys                                         | Desktop WebKit approximation                         | Unthrottled                                     | Playwright                                          | Automated pass; not physical Safari |
| Public shell, locale, Sahel, Atlas table and Desk resume           | Pixel 5 viewport/touch, Chromium                     | Emulated 3G: 150 ms, 1.6 Mbps down, 750 Kbps up | Playwright CDP profile attachment                   | Automated pass                      |
| Public shell, locale, automatic Sahel, Atlas table and Desk resume | Pixel 5 viewport/touch, Chromium                     | Emulated 2G: 400 ms, 400 Kbps down, 160 Kbps up | Playwright CDP profile attachment                   | Automated pass                      |
| Launch routes and complete Desk submission                         | Approved mid-range Android handset                   | Real Wi-Fi/4G/3G/2G                             | Device-lab record, screen/video and network capture | Not run                             |
| Launch routes and complete Desk submission                         | Current Samsung Internet on approved Samsung handset | Real Wi-Fi/4G/3G/2G                             | Device-lab record, screen/video and network capture | Not run                             |
| Launch routes and complete Desk submission                         | Current iOS Safari on approved iPhone                | Real Wi-Fi/4G/3G                                | Device-lab record                                   | Not run                             |

The automated mobile projects are isolated to `e2e/device-network.spec.ts`; desktop projects exclude that file. Both projects record the viewport, touch/mobile flags and exact network profile in the Playwright report. The suite verifies a 44-by-44 CSS-pixel locale target, no horizontal overflow, EN/FR navigation, automatic Sahel activation on 2G, Atlas table-first routing and Protocol Desk persistence after hydration and reload.

## Physical-device procedure

1. Deploy the exact release candidate to protected production-like staging and record Web/API revisions.
2. Use owned test devices with current OS/browser versions. Record exact model, RAM class, OS, browser build, viewport and battery/thermal state.
3. Use a controlled network appliance or carrier condition and record measured latency, downlink, uplink and loss; a browser preset alone is not a real-network result.
4. Clear browser storage before each profile. Exercise `/`, `/fr`, `/record`, `/record/atlas`, `/press`, `/speaking`, `/speaking/request` and `/contact` in both locales where available.
5. On 2G, verify automatic Sahel mode, table-first Atlas, deferred media, visible recovery states, no stalled navigation and successful saved Desk progress. Complete one synthetic Desk request per device/browser—not per network repetition—and quarantine it afterward.
6. Check portrait/landscape, 200% text, keyboard where applicable, touch targets, zoom, back/forward, refresh, offline interruption/recovery and no horizontal page overflow.
7. Capture user-visible timing, failures, screenshots/video and provider/client network evidence without personal data or credentials.
8. Record defects separately. A rerun closes a row only with the fixed revision and linked evidence.

Use [the controlled report template](templates/device-lab-report.md). AMANOR-138 cannot enter review solely from Playwright emulation; the mid-range Android and Samsung Internet rows must pass on physical hardware, and Product/QA/Accessibility must sign the report.
